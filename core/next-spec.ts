// The owner's sent answers become the next spec version. Each answer picks one of the options Claude wrote for a
// finding, and each option already carries its edit (core/spec-edit.ts), checked before the owner saw it. So this
// step decides nothing: it applies the picked edits together, records each answer as a ruling, and runs Z3 and
// the past cases on the result so the owner approves the version by seeing what it changes. The new version is
// written unapproved; nothing here can approve it (principle 6).
import type { FindingAnswer } from "./answers.ts";
import { changes, flips, type Change, type OptionEdits, type PastCase } from "./impact.ts";
import { specHash } from "./pane.ts";
import { checkSop, type Finding } from "./sop-checks.ts";
import { applyEdits, target, type Ruling, type SpecEdit } from "./spec-edit.ts";
import type { Spec } from "./spec.ts";

// A finding as the pane's spec.json holds it, with what Claude wrote for it.
export type AskedFinding = Pick<Finding, "id" | "rule_ids" | "sop_refs"> & { question: string | null; options: string[]; option_edits?: OptionEdits[] };
export type PaneSpecFile = { domain: string; version: number; spec_hash: string; findings: AskedFinding[] };

export type NextSpec = {
  spec: Spec | null;             // null when a problem stops it
  problems: string[];
  rulings: Ruling[];
  findings: Finding[];           // Z3's findings on the new version
  changes: Change[];             // kinds of case that decide differently from the current version
  flips: ReturnType<typeof flips>;
};

const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

export async function nextSpec(spec: Spec, file: { path: string }, pane: PaneSpecFile, answers: FindingAnswer[], past: PastCase[]): Promise<NextSpec> {
  const stop = (problems: string[]): NextSpec => ({ spec: null, problems, rulings: [], findings: [], changes: [], flips: [] });
  // The answers were given on the pane's files, so those files must be from this very spec.
  if (pane.domain !== spec.domain || pane.version !== spec.version || pane.spec_hash !== specHash(spec)) {
    return stop([`The pane's spec.json is from a different spec than ${file.path} (version ${pane.version}); run pnpm resolve on it first, then answer again.`]);
  }
  if (!answers.length) return stop(["No answers have been sent for this version."]);

  // Each answer must be to a finding this spec still has, about the same rules, and pick an option with an edit.
  const problems: string[] = [], rulings: Ruling[] = [], edits: SpecEdit[] = [];
  const asked = new Map(pane.findings.map((f) => [f.id, f]));
  for (const a of answers) {
    const f = asked.get(a.id);
    if (!f) { problems.push(`The answer to ${a.id} is for a finding the spec no longer has.`); continue; }
    if (!same(a.rule_ids, f.rule_ids)) { problems.push(`The answer to "${f.question ?? a.id}" was about other rules than the finding is now; answer it again.`); continue; }
    const o = (f.option_edits ?? []).find((x) => x.option === a.choice);
    if (!o) { problems.push(`The answer "${a.choice}" to "${f.question ?? a.id}" isn't one of the options Resolve checked.`); continue; }
    rulings.push({ finding: f.id, rule_ids: f.rule_ids, sop_refs: f.sop_refs, question: f.question ?? "", choice: a.choice, edits: o.edits, answered_on: spec.version, at: a.at });
    edits.push(...o.edits);
  }
  if (problems.length) return stop(problems);
  // Two answers that change the same thing can't both be applied: say which questions, in the owner's words.
  const by = new Map<string, Ruling[]>();
  for (const r of rulings) for (const t of new Set(r.edits.map(target))) by.set(t, [...(by.get(t) ?? []), r]);
  const clash = [...by.entries()].filter(([, rs]) => rs.length > 1).map(([t, rs]) => {
    const rule = t.startsWith("rule ") ? spec.rules.find((x) => `rule ${x.id}` === t) : undefined;
    return `The answers to ${rs.map((r) => `"${r.question}"`).join(" and ")} both change ${rule ? `the rule from ${rule.sop}` : t.replace(/^rule .*/, "the same rule")}; answer one of them again, then send.`;
  });
  if (clash.length) return stop(clash);

  // The answers go into one version together.
  const applied = applyEdits(spec, edits);
  if (applied.problems.length) return stop(applied.problems.map((p) => `Together, the answers don't make a usable spec: ${p}`));
  const next: Spec = { ...applied.spec, version: spec.version + 1, previous: { file: file.path, version: spec.version },
                       rulings: [...(spec.rulings ?? []), ...rulings] };
  return { spec: next, problems: [], rulings, findings: await checkSop(next), changes: await changes(spec, next), flips: flips(spec, next, past) };
}
