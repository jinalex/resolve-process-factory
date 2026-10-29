// A change to a spec, written as data, so the policy owner's answer to a finding becomes a rule change that
// Z3, the evaluator and a person can all check before it counts. Claude writes one change per option when it
// writes a finding's question (drafting/write-options.ts); applying the option the owner picked is then mechanical.
// An edit only touches the decisions: rules, the order, outcomes for unknowns, who counts in a list, and named
// lists. Facts and the pack's computed facts stay as they are, so two versions can be compared on one case.
import type { Collection, Condition, Outcome, Rule, Spec } from "./spec.ts";
import { validateSpec } from "./spec.ts";
import { quoted, sections } from "./sop-text.ts";

export type SpecEdit =
  | { op: "replace_rule"; rule: Rule }                    // the same id, with a new condition, outcome or text
  | { op: "add_rule"; rule: Rule }
  | { op: "remove_rule"; id: string }
  | { op: "set_order"; order: Outcome[] }
  | { op: "set_unknowns"; then: Outcome }
  | { op: "set_counts_when"; list: string; counts_when: Condition | null }  // null: every item counts
  | { op: "set_list"; key: string; values: string[] };

// The owner's answer to a finding, as the next version records it: which finding, what was asked, what was picked,
// and the edits that answer made. An answer that keeps the rules as they are has no edits.
export type Ruling = {
  finding: string; rule_ids: string[]; sop_refs: string[];
  question: string; choice: string; edits: SpecEdit[];
  answered_on: number;  // the spec version the question was asked on
  at: string;
};

// What an edit is about, so two answers in one batch can't silently overwrite each other.
export function target(e: SpecEdit): string {
  switch (e.op) {
    case "replace_rule": case "add_rule": return `rule ${e.rule.id}`;
    case "remove_rule": return `rule ${e.id}`;
    case "set_order": return "the order";
    case "set_unknowns": return "the outcome for unknowns";
    case "set_counts_when": return `who counts in ${e.list}`;
    case "set_list": return `the list ${e.key}`;
  }
}

// Problems with the edits on this spec, in plain sentences, before validating the result.
function editProblems(spec: Spec, edits: SpecEdit[]): string[] {
  const problems: string[] = [];
  const ops = new Set(["replace_rule", "add_rule", "remove_rule", "set_order", "set_unknowns", "set_counts_when", "set_list"]);
  const ids = new Set(spec.rules.map((r) => r.id));
  const seen = new Set<string>();
  for (const e of edits) {
    if (!e || typeof e !== "object" || !ops.has((e as { op: string }).op)) { problems.push(`${JSON.stringify(e)} isn't an edit Resolve knows.`); continue; }
    const t = target(e);
    if (seen.has(t)) problems.push(`Two edits change ${t}.`);
    seen.add(t);
    if (e.op === "replace_rule" && !ids.has(e.rule.id)) problems.push(`The edit replaces rule ${e.rule.id}, which the spec doesn't have.`);
    if (e.op === "remove_rule" && !ids.has(e.id)) problems.push(`The edit removes rule ${e.id}, which the spec doesn't have.`);
    if (e.op === "add_rule" && ids.has(e.rule.id)) problems.push(`The edit adds rule ${e.rule.id}, which the spec already has; replace it instead.`);
    if (e.op === "set_counts_when" && !spec.collections.some((c) => c.key === e.list)) problems.push(`The edit changes who counts in ${e.list}, which isn't a list in the spec.`);
    if (e.op === "set_list" && !(e.key in spec.lists)) problems.push(`The edit changes the list ${e.key}, which the spec doesn't have.`);
    if (e.op === "set_list" && (!Array.isArray(e.values) || e.values.some((v) => typeof v !== "string"))) problems.push(`The edit gives the list ${e.key} values that aren't text.`);
  }
  return problems;
}

// The spec with the edits made, in order, or the problems that stop them. The version and the rest of the spec
// are left alone; next-spec.ts sets the version. Rules keep their place and their id, so answers and findings
// that point at a rule still find it.
export function applyEdits(spec: Spec, edits: SpecEdit[]): { spec: Spec; problems: string[] } {
  const problems = editProblems(spec, edits);
  if (problems.length) return { spec, problems };
  const out = structuredClone(spec);
  for (const e of structuredClone(edits)) {
    switch (e.op) {
      case "replace_rule": out.rules = out.rules.map((r) => (r.id === e.rule.id ? e.rule : r)); break;
      case "add_rule": out.rules.push(e.rule); break;
      case "remove_rule": out.rules = out.rules.filter((r) => r.id !== e.id); break;
      case "set_order": out.order = e.order; break;
      case "set_unknowns": out.unknowns = { ...out.unknowns, then: e.then }; break;
      case "set_counts_when": out.collections = out.collections.map((c): Collection => {
        if (c.key !== e.list) return c;
        const { counts_when: _old, ...rest } = c;
        return e.counts_when ? { ...rest, counts_when: e.counts_when } : rest;
      }); break;
      case "set_list": out.lists = { ...out.lists, [e.key]: e.values }; break;
    }
  }
  return { spec: out, problems: validateSpec(out) };
}

// A rule an edit writes still says which SOP sentences it comes from, word for word. Answering a finding changes
// what a rule does, not what the SOP says; the ruling records the owner's words.
export function textProblems(edits: SpecEdit[], sop: string): string[] {
  const secs = sections(sop), problems: string[] = [];
  for (const e of edits) {
    if (e.op !== "add_rule" && e.op !== "replace_rule") continue;
    const refs = String(e.rule.sop ?? "").split(/\s*,\s*/).filter(Boolean), missing = refs.filter((r) => !secs.has(r));
    if (!refs.length) problems.push(`Rule ${e.rule.id} names no SOP section.`);
    else if (missing.length) problems.push(`Rule ${e.rule.id} cites ${missing.join(", ")}, which isn't a section of the SOP.`);
    else if (!e.rule.text || !quoted(refs.map((r) => secs.get(r)!), e.rule.text)) problems.push(`Rule ${e.rule.id} quotes words that aren't in ${refs.join(", ")}: "${e.rule.text ?? ""}"`);
  }
  return problems;
}
