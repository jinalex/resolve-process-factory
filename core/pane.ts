// Writes what the Resolve pane reads (docs/INTERFACE.md): spec.json and status.json from a spec and Z3's findings.
// Nothing here knows the domain; a pack adds cases.json. Each file is written whole and renamed into place,
// because the pane re-reads them every two seconds and must never see half a file.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Finding } from "./sop-checks.ts";
import type { Condition, Spec } from "./spec.ts";
import type { RuleFormula } from "./rule-formulas.ts";
import { ROOT } from "./load.ts";

export function writeFile(dir: string, name: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${name}.tmp`);
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, join(dir, name));
}

export function readFile<T>(dir: string, name: string): T | null {
  try { return JSON.parse(readFileSync(join(dir, name), "utf8")) as T; } catch { return null; }
}

export type Status = { stage: 1 | 2 | 3; state: "working" | "needs_review" | "waiting" | "done"; activity: string;
                       progress?: [number, number]; updated_at: string };

export function writeStatus(dir: string, s: Omit<Status, "updated_at">) {
  writeFile(dir, "status.json", { ...s, updated_at: new Date().toISOString() });
}

// What Claude and the expert add to a finding. Z3 never writes these, so a rerun keeps them.
const KEPT = ["question", "options", "answer", "severity", "impact"] as const;
type PaneFinding = Omit<Finding, "example"> & { example: string; question: string | null; options: string[]; answer: unknown };

// The facts a condition reads, for "which SOP sections need this fact".
function factsIn(c: Condition, out = new Set<string>()) {
  for (const [k, v] of Object.entries(c)) {
    if (k === "fact") out.add(v as string);
    else if (typeof v === "object" && v) factsIn(v as Condition, out);
  }
  return out;
}

const words = (k: string) => k.replace(/_/g, " ");
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// The SOP's title, from the first heading of its file.
export function sopTitle(spec: Spec) {
  try {
    const line = readFileSync(join(ROOT, spec.sop.file), "utf8").split("\n").find((l) => l.startsWith("# "));
    return line ? line.slice(2).trim() : spec.sop.file;
  } catch { return spec.sop.file; }
}

// spec.json for one spec version. `previous` is the spec.json already on disk: the question, options and answer
// Claude and the expert gave a finding carry over to the same finding, and so do past cases.
export function paneSpec(spec: Spec, findings: Finding[], formulas: RuleFormula[], previous: Record<string, unknown> | null = null) {
  const before = new Map(((previous?.findings ?? []) as Record<string, unknown>[]).map((f) => [f.id, f]));
  const code = new Map(formulas.map((f) => [f.id, f.applies]));

  // One SOP entry per section: its sentences and the rules written from them.
  const sop = new Map<string, { ref: string; text: string; rules: string[] }>();
  const add = (ref: string, text: string, rule?: string) => {
    const s = sop.get(ref) ?? { ref, text: "", rules: [] };
    if (!s.text.includes(text)) s.text = s.text ? `${s.text} ${text}` : text;
    if (rule) s.rules.push(rule);
    sop.set(ref, s);
  };
  add(spec.order_sop, `The most severe outcome governs: ${spec.order.map(words).join(", then ")}.`);
  add(spec.unknowns.sop, spec.unknowns.text);
  for (const r of spec.rules) add(r.sop, r.text, r.id);
  const byRef = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

  const users = new Map<string, Set<string>>();
  for (const r of spec.rules) for (const f of factsIn(r.when)) users.set(f, (users.get(f) ?? new Set()).add(r.sop));

  return {
    version: spec.version,
    approved: false,
    sop_title: sopTitle(spec),
    sop: [...sop.values()].sort((a, b) => byRef(a.ref, b.ref)),
    rules: spec.rules.map((r) => ({ id: r.id, says: r.text, then: r.then, sop_refs: [r.sop], code: code.get(r.id) })),
    facts: spec.facts.map((f) => ({
      key: f.key, name: capital(words(f.key)), values: [...f.values, "unknown"],
      required_by: [...(users.get(f.key) ?? [])].sort(byRef), ...(f.per === "case" ? {} : { per: f.per }),
    })),
    findings: findings.map((f): PaneFinding => {
      const kept = before.get(f.id) ?? {};
      return {
        ...f, example: f.example ?? "", question: null, options: [], answer: null,
        ...Object.fromEntries(KEPT.filter((k) => k in kept).map((k) => [k, kept[k]])),
      };
    }),
    applied: previous?.applied ?? [],
    past_cases: previous?.past_cases ?? [],
  };
}
