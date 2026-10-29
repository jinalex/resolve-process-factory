// Writes what the Resolve pane reads (docs/INTERFACE.md): spec.json and status.json from a spec and Z3's findings.
// Nothing here knows the domain; a pack adds cases.json. Each file is written whole and renamed into place,
// because the pane re-reads them every two seconds and must never see half a file.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "./sop-checks.ts";
import type { Condition, Spec } from "./spec.ts";
import type { RuleFormula } from "./rule-formulas.ts";
import { ROOT } from "./load.ts";
import { domains } from "./z3.ts";

// A run that can't go on, in a sentence for the pane's activity line.
export class PaneError extends Error {}

export function writeFile(dir: string, name: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  // A temporary name of its own, so two runs writing at once never rename each other's file.
  const tmp = join(dir, `.${name}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, join(dir, name));
}

// The spec.json from an earlier run, or null if there is none. A file that can't be read is an error, not
// "no earlier run": it may hold the expert's answers, so it is left alone for a person to look at.
export function readPrevious(dir: string): Record<string, unknown> | null {
  let text: string;
  try { text = readFileSync(join(dir, "spec.json"), "utf8"); } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new PaneError(`Couldn't read the spec.json already in ${dir}: ${(e as Error).message}`);
  }
  let data: unknown;
  try { data = JSON.parse(text); } catch {
    throw new PaneError(`The spec.json already in ${dir} isn't valid JSON, so its answers can't be kept. Fix or move it, then run again.`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data) || !Array.isArray((data as { findings?: unknown }).findings))
    throw new PaneError(`The spec.json already in ${dir} has no list of findings, so its answers can't be kept. Fix or move it, then run again.`);
  return data as Record<string, unknown>;
}

export type Status = { stage: 1 | 2 | 3; state: "working" | "needs_review" | "waiting" | "done" | "failed"; activity: string;
                       progress?: [number, number]; updated_at: string };

export function writeStatus(dir: string, s: Omit<Status, "updated_at">) {
  writeFile(dir, "status.json", { ...s, updated_at: new Date().toISOString() });
}

// The SOP's numbered paragraphs ("3.3. Unless the entity ..."), in full, and its title.
export function readSop(spec: Spec) {
  let text = "";
  try { text = readFileSync(join(ROOT, spec.sop.file), "utf8"); } catch { /* the rules' own sentences stand in */ }
  const lines = text.split("\n");
  const title = lines.find((l) => l.startsWith("# "))?.slice(2).trim() ?? spec.sop.file;
  const sections = new Map<string, string>();
  let ref: string | null = null;
  for (const line of lines) {
    const m = /^(\d+\.\d+)\.\s+(.*)$/.exec(line.trim());
    if (m) { ref = m[1]; sections.set(ref, m[2]); }
    else if (ref && line.trim() && !line.startsWith("#")) sections.set(ref, `${sections.get(ref)} ${line.trim()}`);
    else ref = null;
  }
  return { title, sections };
}

// What Claude and the expert add to a finding. Z3 never writes these.
const KEPT = ["question", "options", "answer", "severity", "impact"] as const;
type PaneFinding = Omit<Finding, "example"> & { example: string; question: string | null; options: string[]; answer: unknown };

// A finding means the same thing when Z3 says the same about the same rules. Timings and the solver's
// choice of example case don't change its meaning.
const meaning = (f: Record<string, unknown>) => JSON.stringify([f.kind, f.title, f.explain, f.sop_refs, f.rule_ids]);

// The facts a condition reads, for "which SOP sections need this fact".
function factsIn(c: Condition, out = new Set<string>()) {
  for (const [k, v] of Object.entries(c)) {
    if (k === "fact" || k === "computed") out.add(v as string);
    else if (typeof v === "object" && v) factsIn(v as Condition, out);
  }
  return out;
}

const words = (k: string) => k.replace(/_/g, " ");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const byRef = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

// spec.json for one spec version. `previous` is the spec.json already on disk. What Claude and the expert added
// carries over only to the same spec: same domain and version, and for a finding, the same finding. Approval
// carries over only if the spec itself is unchanged. `names` gives facts the names the pack wants shown.
export function paneSpec(spec: Spec, findings: Finding[], formulas: RuleFormula[], previous: Record<string, unknown> | null = null,
                         names: Record<string, string> = {}) {
  const hash = createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 16);
  const same = previous?.domain === spec.domain && previous?.version === spec.version ? previous : null;
  const before = new Map(((same?.findings ?? []) as Record<string, unknown>[]).map((f) => [f.id, f]));
  const code = new Map(formulas.map((f) => [f.id, f.applies]));
  const { title, sections } = readSop(spec);

  // Every numbered SOP paragraph, with the rules written from it. A paragraph no rule covers is listed with
  // none, so the pane can mark it. The order and unknowns paragraphs are covered by the spec's own settings.
  const sop = new Map<string, { ref: string; text: string; rules: string[]; covered: boolean }>();
  for (const [ref, text] of sections) sop.set(ref, { ref, text, rules: [], covered: false });
  const cover = (ref: string, text: string, rule?: string) => {
    const s = sop.get(ref) ?? { ref, text, rules: [], covered: false };
    if (rule) s.rules.push(rule);
    s.covered = true;
    sop.set(ref, s);
  };
  cover(spec.order_sop, `The most severe outcome governs: ${spec.order.map(words).join(", then ")}.`);
  cover(spec.unknowns.sop, spec.unknowns.text);
  for (const r of spec.rules) cover(r.sop, r.text, r.id);

  const users = new Map<string, Set<string>>();
  for (const r of spec.rules) for (const f of factsIn(r.when)) users.set(f, (users.get(f) ?? new Set()).add(r.sop));
  const dom = domains(spec);
  // The SOP's own words for each value of a fact with a word map, so whoever classifies the evidence
  // sorts it into the SOP's categories ("virtual currency" is crypto), not into words of its own.
  const sopWords = (key: string) => {
    const map = spec.maps?.[key];
    if (!map) return {};
    const byValue: Record<string, string[]> = {};
    for (const [word, value] of Object.entries(map)) (byValue[value] ??= []).push(word);
    return { sop_words: byValue };
  };
  const fact = (key: string, extra: object) => ({
    key, name: names[key] ?? capital(words(key)), values: dom[key]?.labels ?? [],
    required_by: [...(users.get(key) ?? [])].sort(byRef), ...sopWords(key), ...extra,
  });

  return {
    domain: spec.domain,
    version: spec.version,
    spec_hash: hash,
    approved: same?.spec_hash === hash ? Boolean(same.approved) : false,
    sop_title: title,
    ...(same?.sop_doc ? { sop_doc: same.sop_doc } : {}),
    sop: [...sop.values()].sort((a, b) => byRef(a.ref, b.ref)),
    rules: spec.rules.map((r) => ({ id: r.id, says: r.text, then: r.then, sop_refs: [r.sop], code: code.get(r.id) })),
    facts: [
      ...spec.facts.map((f) => fact(f.key, f.per === "case" ? {} : { per: f.per })),
      ...spec.computed.map((c) => fact(c.key, { computed: true, ...(c.numeric ? { values: [], numeric: true } : {}) })),
    ],
    findings: findings.map((f): PaneFinding => {
      const old = before.get(f.id);
      const kept = old && meaning(old) === meaning(f) ? old : {};
      return {
        ...f, example: f.example ?? "", question: null, options: [], answer: null,
        ...Object.fromEntries(KEPT.filter((k) => k in kept).map((k) => [k, kept[k]])),
      };
    }),
    applied: same?.applied ?? [],
    ...(same?.changes_from_previous ? { changes_from_previous: same.changes_from_previous } : {}),
    past_cases: same?.past_cases ?? [],
  };
}
