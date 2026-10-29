// Answers → the next spec version, on the expenses SOP (fast, and not KYB): edits, reading answers, each option's
// impact, and the next version itself. Every example case Resolve shows for a change must flip in the evaluator.
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readAnswers } from "./answers.ts";
import { evaluate } from "./evaluate.ts";
import { changes, optionImpact, type OptionEdits, type PastCase } from "./impact.ts";
import { ROOT, loadSpec } from "./load.ts";
import { nextSpec, type PaneSpecFile } from "./next-spec.ts";
import { specHash } from "./pane.ts";
import { checkSop } from "./sop-checks.ts";
import { applyEdits, textProblems, type SpecEdit } from "./spec-edit.ts";
import type { Rule } from "./spec.ts";
import { shutdown } from "./z3.ts";
import { type Claim, toCase } from "../packs/expenses/claim.ts";

afterAll(shutdown);
const spec = loadSpec("spec/expenses-v1.json");
const sop = readFileSync(join(ROOT, spec.sop.file), "utf8");
const rule = (id: string) => structuredClone(spec.rules.find((r) => r.id === id)!);
const past: PastCase[] = (JSON.parse(readFileSync(join(ROOT, "packs/expenses/examples.json"), "utf8")) as { id: string; name: string; expected: [string, string | null]; claim: Claim }[])
  .map((e) => ({ id: e.id, name: e.name, decision: e.expected[0], case: toCase(e.claim) }));

// 4.1 returns a claim while a receipt hasn't come back; the owner can say that's incomplete under 2.2 instead.
const receiptOnlyWhenMissing: SpecEdit = { op: "replace_rule", rule: { ...rule("receipt"),
  when: { some: "lines", where: { all: [{ fact: "amount_band", is: "75_or_more" }, { fact: "itemised_receipt", is: "no" }] } } } };
const options: OptionEdits[] = [
  { option: "Return it now", says: "4.1 returns the claim while a receipt hasn't come back.", edits: [] },
  { option: "Incomplete until the receipt comes", says: "4.1 returns a claim only when a receipt is missing.", edits: [receiptOnlyWhenMissing] },
];

describe("spec edits", () => {
  it("replace, add and remove rules, keeping ids and places", () => {
    const added: Rule = { ...rule("alcohol"), id: "alcohol-2" };
    const { spec: out, problems } = applyEdits(spec, [receiptOnlyWhenMissing, { op: "remove_rule", id: "pre-approved-business" }, { op: "add_rule", rule: added }]);
    expect(problems).toEqual([]);
    expect(out.rules.map((r) => r.id)).toEqual([...spec.rules.map((r) => r.id).filter((id) => id !== "pre-approved-business"), "alcohol-2"]);
    expect(out.rules.find((r) => r.id === "receipt")!.when).toEqual(receiptOnlyWhenMissing.rule.when);
    expect(out.version).toBe(spec.version);
    expect(spec.rules.find((r) => r.id === "receipt")!.when).not.toEqual(receiptOnlyWhenMissing.rule.when);  // the input is untouched
  });

  it("refuse edits that point at nothing, clash, or leave a spec that doesn't load", () => {
    expect(applyEdits(spec, [{ op: "remove_rule", id: "nope" }]).problems).toEqual(["The edit removes rule nope, which the spec doesn't have."]);
    expect(applyEdits(spec, [{ op: "add_rule", rule: rule("late") }]).problems[0]).toMatch(/already has/);
    expect(applyEdits(spec, [receiptOnlyWhenMissing, { op: "remove_rule", id: "receipt" }]).problems).toEqual(["Two edits change rule receipt."]);
    expect(applyEdits(spec, [{ op: "set_order", order: ["reject", "approve"] }]).problems.length).toBeGreaterThan(0);
    expect(applyEdits(spec, [{ op: "frobnicate" } as unknown as SpecEdit]).problems[0]).toMatch(/isn't an edit/);
    // An unknown must never switch a rule off.
    const hides: SpecEdit = { op: "replace_rule", rule: { ...rule("alcohol"), when: { all: [{ some: "lines", where: { fact: "category", is: "alcohol" } }, { not: { fact: "director_signed", is_unknown: true } }] } } };
    expect(applyEdits(spec, [hides]).problems[0]).toMatch(/an unknown director_signed hides it/);
  });

  it("keep each rule's words the SOP's own", () => {
    expect(textProblems([receiptOnlyWhenMissing], sop)).toEqual([]);
    const reworded = { ...receiptOnlyWhenMissing, rule: { ...receiptOnlyWhenMissing.rule, text: "Return the claim only if a receipt is missing." } };
    expect(textProblems([reworded], sop)[0]).toMatch(/quotes words that aren't in 4.1/);
    expect(textProblems([{ op: "add_rule", rule: { ...rule("late"), id: "x", sop: "9.9" } }], sop)[0]).toMatch(/9.9, which isn't a section/);
  });
});

describe("reading the answers", () => {
  const line = (x: object) => JSON.stringify(x);
  const f = (choice: string, v = 1) => line({ type: "finding", id: "unknown-receipt", rule_ids: ["receipt"], choice, spec_version: v, at: "t" });

  it("counts only what was sent, for this version, as it stood when sent", () => {
    const text = [f("A"), f("B"), line({ type: "send", ids: ["unknown-receipt"], spec_version: 1, at: "t" }), f("C"),
                  f("D", 2), line({ type: "send", ids: ["unknown-receipt"], spec_version: 2, at: "t" })].join("\n");
    const a = readAnswers(text, 1);
    expect(a.findings).toEqual([{ id: "unknown-receipt", rule_ids: ["receipt"], choice: "B", at: "t" }]);
    expect(a.other_versions).toBe(2);
    expect(a.problems).toEqual([]);
  });

  it("leaves nothing pending in, and says what it couldn't read", () => {
    const a = readAnswers([f("A"), "{oops", line({ type: "send", ids: ["dead-x"], spec_version: 1 }), line({ type: "approve_spec", version: 1, spec_version: 1 })].join("\n"), 1);
    expect(a.findings).toEqual([]);
    expect(a.problems).toEqual(["Line 2 of the answers isn't a JSON object, so it was left out.", "dead-x was sent, but there's no answer for it on version 1."]);
    expect(a.approved).toBe(true);
    // An approval that names another spec approved that spec, not this one.
    expect(readAnswers(line({ type: "approve_spec", version: 1, spec_version: 1, spec_hash: "old" }), 1, "new").approved).toBe(false);
    expect(readAnswers(line({ type: "approve_spec", version: 1, spec_version: 1, spec_hash: "new" }), 1, "new").approved).toBe(true);
  });
});

describe("what an option would change", () => {
  it("shows each kind of case that flips, with an example the evaluator agrees with", async () => {
    const edited = applyEdits(spec, [receiptOnlyWhenMissing]).spec;
    const cs = await changes(spec, edited);
    expect(cs.map((c) => [c.from, c.to])).toEqual([["return", "incomplete"]]);
    expect(cs[0].example).toMatch(/itemised receipt for line 1 is unknown/);
    expect(cs[0].example).toMatch(/now comes out return \(4.1\) and would come out incomplete \(2.2\)/);
  }, 60_000);

  it("works out every option: problems, the finding gone, new findings, flips and past decisions matched", async () => {
    const keep = await optionImpact(spec, { id: "unknown-receipt" }, options[0], past, sop);
    expect(keep).toMatchObject({ keeps_rules: true, resolves: false, changes: [], flips: [], problems: [] });
    const fix = await optionImpact(spec, { id: "unknown-receipt" }, options[1], past, sop);
    expect(fix).toMatchObject({ keeps_rules: false, resolves: true, new_findings: [], problems: [] });
    expect(fix.changes).toHaveLength(1);
    expect(fix.matches_past).toBe(past.filter((p) => evaluate(applyEdits(spec, options[1].edits).spec, p.case).outcome === p.decision).length);
    const broken = await optionImpact(spec, { id: "unknown-receipt" }, { option: "x", says: "", edits: [{ op: "remove_rule", id: "nope" }] }, past, sop);
    expect(broken.problems).toEqual(["The edit removes rule nope, which the spec doesn't have."]);
  }, 60_000);

  it("finds a new problem an option would cause", async () => {
    // Returning a claim whenever the director's sign-off is unknown makes 4.2 decide on an unknown fact.
    const careless: OptionEdits = { option: "y", says: "", edits: [{ op: "replace_rule", rule: { ...rule("alcohol"),
      when: { any: [{ some: "lines", where: { fact: "category", is: "alcohol" } }, { fact: "director_signed", is_unknown: true }] } } }] };
    const r = await optionImpact(spec, { id: "unknown-receipt" }, careless, past, sop);
    expect(r.resolves).toBe(false);
    expect(r.new_findings.map((f) => f.id)).toEqual(["unknown-alcohol"]);
  }, 60_000);
});

describe("the next version", () => {
  const pane = async (): Promise<PaneSpecFile> => ({ domain: spec.domain, version: spec.version, spec_hash: specHash(spec),
    findings: (await checkSop(spec)).map((f) => f.id === "unknown-receipt" ? { ...f, question: "Return it or wait?", options: options.map((o) => o.option), option_edits: options }
                                                                            : { ...f, question: null, options: [] }) });
  const answer = (choice: string, rule_ids = ["receipt"]) => [{ id: "unknown-receipt", rule_ids, choice, at: "t" }];

  it("applies the picked edit, records the ruling, and shows what changes", async () => {
    const r = await nextSpec(spec, { path: "spec/expenses-v1.json" }, await pane(), answer(options[1].option), past);
    expect(r.problems).toEqual([]);
    expect(r.spec).toMatchObject({ version: 2, previous: { file: "spec/expenses-v1.json", version: 1 } });
    expect(r.spec!.rulings).toEqual([{ finding: "unknown-receipt", rule_ids: ["receipt"], sop_refs: ["4.1", "2.2"], question: "Return it or wait?",
      choice: options[1].option, edits: options[1].edits, answered_on: 1, at: "t" }]);
    expect(r.findings.map((f) => f.id)).not.toContain("unknown-receipt");
    expect(r.changes.map((c) => [c.from, c.to])).toEqual([["return", "incomplete"]]);
    // Only the decisions changed: the facts, lists and computed facts are the same.
    const { rules: _a, version: _b, previous: _c, rulings: _d, ...rest } = r.spec!;
    const { rules: _e, version: _f, ...before } = spec;
    expect(rest).toEqual(before);
  }, 60_000);

  it("records an answer that keeps the rules, with no change", async () => {
    const r = await nextSpec(spec, { path: "spec/expenses-v1.json" }, await pane(), answer(options[0].option), past);
    expect(r.spec!.rules).toEqual(spec.rules);
    expect(r.spec!.rulings![0].edits).toEqual([]);
    expect(r.changes).toEqual([]);
  }, 60_000);

  it("refuses answers it can't tie to this spec and its checked options", async () => {
    const p = await pane();
    expect((await nextSpec(spec, { path: "x" }, { ...p, spec_hash: "different" }, answer(options[1].option), past)).problems[0]).toMatch(/different spec/);
    expect((await nextSpec(spec, { path: "x" }, p, answer(options[1].option, ["alcohol"]), past)).problems[0]).toMatch(/other rules/);
    expect((await nextSpec(spec, { path: "x" }, p, answer("Something else"), past)).problems[0]).toMatch(/isn't one of the options/);
    expect((await nextSpec(spec, { path: "x" }, p, [], past)).problems).toEqual(["No answers have been sent for this version."]);
  }, 60_000);

  it("refuses two answers that change the same rule, naming both questions", async () => {
    const p = await pane();
    const other = { id: "dead-pre-approved-business", rule_ids: p.findings.find((f) => f.id === "dead-pre-approved-business")!.rule_ids, choice: "Drop 4.5", at: "t" };
    p.findings = p.findings.map((f) => f.id === other.id ? { ...f, question: "Keep 4.5?", options: ["Drop 4.5"],
      option_edits: [{ option: "Drop 4.5", says: "", edits: [{ op: "replace_rule", rule: { ...receiptOnlyWhenMissing.rule } }] }] } : f);
    const r = await nextSpec(spec, { path: "x" }, p, [...answer(options[1].option), other], past);
    expect(r.spec).toBeNull();
    expect(r.problems).toEqual([`The answers to "Return it or wait?" and "Keep 4.5?" both change the rule from 4.1; answer one of them again, then send.`]);
  }, 60_000);
});
