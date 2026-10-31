// Writes what the Resolve pane reads (docs/INTERFACE.md): spec.json and status.json from a spec and Z3's findings.
// Nothing here knows the domain; a pack adds cases.json. Each file is written whole and renamed into place,
// because the pane re-reads them every two seconds and must never see half a file.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { findingMeaning, type Finding } from "./sop-checks.ts";
import type { Condition, Spec } from "./spec.ts";
import type { RuleFormula } from "./rule-formulas.ts";
import { ROOT } from "./load.ts";
import { words } from "./evaluate.ts";
import { sections as sopSections } from "./sop-text.ts";
import { domains } from "./z3.ts";
import { changes, deciding, flips, optionImpact, type OptionEdits, type PastCase } from "./impact.ts";
// The files' shape is the pane's contract; type-only, so nothing of the mod runs here.
import type { FindingEntry, ImpactEntry, PastCaseEntry, SpecJson, StatusJson } from "../mod/resolve/types/files.d.ts";

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

export function writeStatus(dir: string, s: Omit<StatusJson, "updated_at">) {
  writeFile(dir, "status.json", { ...s, updated_at: new Date().toISOString() } satisfies StatusJson);
}

// The SOP's numbered paragraphs ("3.3. Unless the entity ..."), in full, and its title.
export function readSop(spec: Spec) {
  let text = "";
  try { text = readFileSync(join(ROOT, spec.sop.file), "utf8"); } catch { /* the rules' own sentences stand in */ }
  const title = text.split("\n").find((l) => l.startsWith("# "))?.slice(2).trim() ?? spec.sop.file;
  return { title, sections: new Map([...sopSections(text)].filter(([ref]) => ref.includes("."))) };
}

// What Claude and the expert add to a finding. Z3 never writes these.
// `option_edits` is the spec edit Claude wrote for each option; Resolve works out each one's `impact` from it.
const KEPT = ["question", "options", "option_edits", "answer", "severity", "impact"] as const;

export const meaning = findingMeaning;

// The facts a condition reads, for "which SOP sections need this fact".
function factsIn(c: Condition, out = new Set<string>()) {
  for (const [k, v] of Object.entries(c)) {
    if (k === "fact" || k === "computed") out.add(v as string);
    else if (typeof v === "object" && v) factsIn(v as Condition, out);
  }
  return out;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const byRef = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

// A fingerprint of a spec, so the pane's files and the owner's answers can be tied to the spec they came from.
export const specHash = (spec: Spec) => createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 16);

// spec.json for one spec version. `previous` is the spec.json already on disk. What Claude and the expert added
// carries over only to the same spec: same domain and version, and for a finding, the same finding. Approval
// carries over only if the spec itself is unchanged. `names` gives facts the names the pack wants shown.
export function paneSpec(spec: Spec, findings: Finding[], formulas: RuleFormula[], previous: Record<string, unknown> | null = null,
                         names: Record<string, string> = {}): SpecJson {
  const hash = specHash(spec);
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
    // The spec's outcomes, most severe first, so the pane shows this spec's outcomes and not one domain's.
    order: spec.order,
    sop_title: title,
    ...(same?.sop_doc ? { sop_doc: String(same.sop_doc) } : {}),
    sop: [...sop.values()].sort((a, b) => byRef(a.ref, b.ref)),
    rules: spec.rules.map((r) => ({ id: r.id, says: r.text, then: r.then, sop_refs: [r.sop], code: code.get(r.id) })),
    facts: [
      ...spec.facts.map((f) => fact(f.key, f.per === "case" ? {} : { per: f.per })),
      ...spec.computed.map((c) => fact(c.key, { computed: true, ...(c.numeric ? { values: [], numeric: true } : {}) })),
    ],
    findings: findings.map((f): FindingEntry => {
      const old = before.get(f.id);
      const kept = old && meaning(old) === meaning(f) ? old : {};
      // An earlier version's answer that kept the rules as they were still answers the same finding here.
      const kept_by = (spec.rulings ?? []).filter((r) => r.finding === f.id && !r.edits.length && JSON.stringify(r.rule_ids) === JSON.stringify(f.rule_ids)).at(-1);
      // What the file on disk holds for those fields is carried as it is: it is this writer's own earlier output, read
      // back (readPrevious), so it isn't checked again here.
      const carried = Object.fromEntries(KEPT.filter((k) => k in kept).map((k) => [k, kept[k]])) as Partial<FindingEntry>;
      const out: FindingEntry = { ...f, example: f.example ?? "", question: null, options: [], answer: null, ...carried };
      // ...unless this run's file already holds an answer of its own.
      if (kept_by && !out.answer) {
        out.question = out.question ?? kept_by.question;
        if (!out.options.length) out.options = [kept_by.choice];
        out.answer = { choice: kept_by.choice, at: kept_by.at, in_version: kept_by.answered_on };
      }
      return out;
    }),
    // Which answers this version absorbed, from the version's own record of them.
    applied: (spec.rulings ?? []).map((r) => ({ id: r.finding, choice: r.choice, applied_in: r.answered_on + 1 })),
    // Carried from the file on disk as they are, like the findings' answers above.
    ...(same?.changes_from_previous ? { changes_from_previous: same.changes_from_previous as SpecJson["changes_from_previous"] } : {}),
    past_cases: (same?.past_cases ?? []) as PastCaseEntry[],
  };
}

// What answers do, added to a spec.json: each option's impact, worked out from the edit Claude wrote for it, and,
// for a version made by answering an earlier one, what changed since that version. `past` are the pack's past
// cases. This is the slow part (Z3 checks the whole spec again for every option), so it runs only where there
// is an edit to check.
// Which options' impact this spec and these edits gave: an impact carried over from the last run is reused only
// while both are the same, so a hand-edited option or spec is worked out again.
export const impactKey = (spec: Spec, o: OptionEdits | undefined) => createHash("sha256").update(JSON.stringify([specHash(spec), o?.option, o?.edits])).digest("hex").slice(0, 16);
// The edits Claude wrote for each option, by option. The file holds them as written; optionImpact checks each one.
const editsOf = (f: FindingEntry) => new Map((f.option_edits ?? []).map((o) => [o.option, o as OptionEdits]));
const current = (f: FindingEntry, spec: Spec) => {
  const edits = editsOf(f);
  return Array.isArray(f.impact) && f.impact.length === f.options.length &&
    f.options.every((o, i) => f.impact![i]?.option === o && f.impact![i]?.of === impactKey(spec, edits.get(o)));
};
// The findings whose options still need their impact worked out.
export const impactPending = (out: SpecJson, spec: Spec) =>
  out.findings.filter((f) => !f.answer && f.option_edits?.length && !current(f, spec)).length;

export async function addImpact(out: SpecJson, spec: Spec, past: PastCase[]): Promise<SpecJson> {
  const ends = [spec.order[0], spec.order.at(-1)];
  let sop: string;
  try { sop = readFileSync(join(ROOT, spec.sop.file), "utf8"); } catch {
    throw new PaneError(`The SOP ${spec.sop.file} can't be read, so the rules an answer would write can't be checked against it.`);
  }
  for (const f of out.findings) {
    // An impact from an earlier run is shown only while it is for this spec and these edits.
    if (!current(f, spec)) { delete f.impact; delete f.severity; }
    if (f.answer || !f.option_edits?.length || current(f, spec)) continue;
    const edits = editsOf(f);
    const twice = new Set(f.option_edits.map((o) => o.option).filter((o, i, all) => all.indexOf(o) !== i));
    // One at a time: the options share one Z3.
    const impact: ImpactEntry[] = [];
    for (const o of f.options) {
      const of = impactKey(spec, edits.get(o));
      impact.push(twice.has(o) ? { option: o, problems: [`Two options are called "${o}", so an answer couldn't say which one it picked.`], of }
        : edits.has(o) ? { ...(await optionImpact(spec, f, edits.get(o)!, past, sop)), of }
        : { option: o, problems: ["Claude wrote no edit for this option, so Resolve can't say what it does."], of });
    }
    f.impact = impact;
    // High when an option can move a case into or out of the most or least severe outcome (KYB: decline, approve),
    // reorders the outcomes or changes what unknowns lead to, or couldn't be checked at all.
    const moves = impact.some((i) => ((i as { changes?: { from: string; to: string }[] }).changes ?? []).some((c) => ends.includes(c.from) || ends.includes(c.to)));
    const broad = f.option_edits.some((o) => (o.edits ?? []).some((e) => e?.op === "set_order" || e?.op === "set_unknowns"));
    f.severity = moves || broad || impact.some((i) => i.problems?.length) ? "high" : "normal";
  }
  if (spec.previous) {
    let before: Spec;
    try { before = JSON.parse(readFileSync(resolve(ROOT, spec.previous.file), "utf8")); } catch {
      throw new PaneError(`Version ${spec.version} was made from ${spec.previous.file}, which can't be read, so what changed can't be shown.`);
    }
    const kinds = await changes(before, spec);
    const flipped = flips(before, spec, past);
    const byId = new Map(past.map((p) => [p.id, p]));
    return { ...out,
      changes_from_previous: kinds.map((c) => ({ from: c.from, to: c.to, example: c.example, example_facts: c.example_facts })),
      past_cases: flipped.map((x) => {
        const p = byId.get(x.case_id)!;
        return { case_id: x.case_id, name: x.name, past_decision: p.decision, previous_spec_decision: x.from, spec_decision: x.to,
                 why: deciding(spec, p.case).map((d) => `${d.sop}: ${d.text}`).join(" "), verdict: null };
      }) };
  }
  return out;
}
