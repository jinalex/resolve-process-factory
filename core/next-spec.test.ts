// Answers → the next spec version, on the expenses SOP (fast, and not KYB): edits, reading answers, each option's
// impact, and the next version itself. Every example case Resolve shows for a change must flip in the evaluator.
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readAnswers } from "./answers.ts";
import { evaluate } from "./evaluate.ts";
import { changes, decidingSections, exampleCase, optionImpact, type OptionEdits, type PastCase } from "./impact.ts";
import { ROOT, loadSpec } from "./load.ts";
import { nextSpec, type PaneSpecFile } from "./next-spec.ts";
import { addImpact, impactKey, impactPending, paneSpec, specHash } from "./pane.ts";
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
const receiptFinding = { id: "unknown-receipt", kind: "unknowns" as const, sop_refs: ["4.1", "2.2"] };
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

  it("report a malformed edit from a model as a problem, not a crash", () => {
    for (const e of [{ op: "replace_rule" }, { op: "add_rule", rule: { id: "x" } }, { op: "remove_rule" }, { op: "set_order", order: "reject" }, { op: "set_list", key: "x" }]) {
      const r = applyEdits(spec, [e as unknown as SpecEdit]);
      expect(r.problems[0]).toMatch(/is missing what it changes/);
      expect(textProblems([e as unknown as SpecEdit], sop)).toEqual([]);
    }
  });

  it("make the other changes a ruling can: order, unknowns, who counts and named lists", () => {
    const order = applyEdits(spec, [{ op: "set_order", order: ["escalate", "reject", "return", "incomplete", "approve"] }]);
    expect([order.problems, order.spec.order[0]]).toEqual([[], "escalate"]);
    expect(applyEdits(spec, [{ op: "set_order", order: ["reject", "escalate", "return", "incomplete", "approve", "hold"] }]).problems[0]).toMatch(/same outcomes as now/);
    expect(applyEdits(spec, [{ op: "set_unknowns", then: "return" }]).spec.unknowns.then).toBe("return");
    // The last outcome is what a case with nothing against it gets; unknowns leading there would read as no.
    expect(applyEdits(spec, [{ op: "set_unknowns", then: "approve" }]).problems[0]).toMatch(/an unknown would pass as if it were no/);
    const gifts = applyEdits(spec, [{ op: "set_counts_when", list: "lines", counts_when: { fact: "category", is: "gift" } }]);
    expect([gifts.problems, gifts.spec.collections[0].counts_when]).toEqual([[], { fact: "category", is: "gift" }]);
    expect(applyEdits(gifts.spec, [{ op: "set_counts_when", list: "lines", counts_when: null }]).spec.collections[0]).not.toHaveProperty("counts_when");
    const kyb = loadSpec("spec/kyb-v1.json");
    expect(applyEdits(kyb, [{ op: "set_list", key: "sanctioned_countries", values: ["IR", "KP"] }]).spec.lists.sanctioned_countries).toEqual(["IR", "KP"]);
    expect(applyEdits(kyb, [{ op: "set_list", key: "sanctioned_countries", values: ["IR", "unknown"] }]).problems[0]).toMatch(/unknown is never a value/);
    // A named list is checked against the values of the fact it's used with.
    const r52 = kyb.rules.find((r) => r.id === "industry-restricted")!;
    expect(applyEdits(kyb, [{ op: "replace_rule", rule: { ...r52, when: { fact: "industry", in: "sanctioned_countries" } } }]).problems[0]).toMatch(/compares industry with "IR", which isn't one of its values/);
  });

  it("report a condition of no known shape, rather than crash on it later", () => {
    for (const when of [{ fact: "self_approved" }, { computed: "total_usd" }, { fact: "category", in: null }, { fact: "category", is: 3 }, null]) {
      const r = applyEdits(spec, [{ op: "replace_rule", rule: { ...rule("self-approved"), when: when as never } }]);
      expect(r.problems.length, JSON.stringify(when)).toBeGreaterThan(0);
    }
    expect(applyEdits(spec, [{ op: "replace_rule", rule: { ...rule("self-approved"), when: { fact: "self_approved" } as never } }]).problems)
      .toEqual([`Rule self-approved has the condition {"fact":"self_approved"}, which isn't a shape Resolve knows.`]);
  });

  it("keep each rule's words the SOP's own", () => {
    expect(textProblems([receiptOnlyWhenMissing], sop)).toEqual([]);
    const reworded = { ...receiptOnlyWhenMissing, rule: { ...receiptOnlyWhenMissing.rule, text: "Return the claim only if a receipt is missing." } };
    expect(applyEdits(spec, [reworded]).problems).toEqual(["The edit rewrites which SOP words rule receipt comes from; a replaced rule keeps its section and text."]);
    expect(textProblems([{ op: "add_rule", rule: { ...reworded.rule, id: "receipt-2" } }], sop)[0]).toMatch(/quotes words that aren't in 4.1/);
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
    const a = readAnswers([f("A"), "{oops", line({ type: "send", ids: ["dead-x"], spec_version: 1 }), line({ type: "approve_spec", version: 1, spec_version: 1, spec_hash: "h" })].join("\n"), 1, "h");
    expect(a.findings).toEqual([]);
    expect(a.problems).toEqual(["Line 2 of the answers isn't a JSON object, so it was left out.", "dead-x was sent, but there's no answer for it on version 1."]);
    expect(a.approved).toBe(true);
    // An approval that names another spec approved that spec, not this one.
    expect(readAnswers(line({ type: "approve_spec", version: 1, spec_version: 1, spec_hash: "old" }), 1, "new").approved).toBe(false);
    expect(readAnswers(line({ type: "approve_spec", version: 1, spec_version: 1, spec_hash: "new" }), 1, "new").approved).toBe(true);
    // One that names no spec could be for an earlier edit of this version.
    expect(readAnswers(line({ type: "approve_spec", version: 1, spec_version: 1 }), 1, "new").approved).toBe(false);
  });

  it("reports lines it can't use rather than guessing", () => {
    const send = (ids: string[]) => line({ type: "send", ids, spec_version: 1, at: "t" });
    const both = readAnswers([f("A"), line({ type: "past_case", case_id: "unknown-receipt", verdict: "right", spec_version: 1 }), send(["unknown-receipt"])].join("\n"), 1);
    expect([both.findings, both.verdicts]).toEqual([[], []]);
    expect(both.problems).toEqual(["unknown-receipt was sent, but it names both a finding (line 1) and a past case (line 2), so neither was used."]);
    const odd = readAnswers([line({ type: "finding", id: "x", rule_ids: [1], choice: "A", spec_version: 1 }), line({ type: "past_case", case_id: "C-1", spec_version: 1 }),
                             line({ type: "finding_answer", spec_version: 1 }), send(["x", "C-1"])].join("\n"), 1);
    expect([odd.findings, odd.verdicts]).toEqual([[], []]);
    expect(odd.problems).toEqual([`Line 3 of the answers is a "finding_answer" line, which Resolve doesn't know, so it was left out.`,
      "The answer on line 1 has no rule_ids or no choice, so it can't be matched to its finding.", "The verdict on line 2 has no verdict, so it was left out."]);
  });
});

describe("what an option would change", () => {
  it("shows each kind of case that flips, with an example the evaluator agrees with", async () => {
    const edited = applyEdits(spec, [receiptOnlyWhenMissing]).spec;
    const cs = await changes(spec, edited);
    expect(cs.map((c) => [c.from, c.to])).toEqual([["return", "incomplete"]]);
    expect(cs[0].example).toMatch(/^When 1 line is listed and amount band for line 1 is "75_or_more" and itemised receipt for line 1 is unknown, and everything else is unknown, /);
    expect(cs[0].example).toMatch(/now comes out return \(4.1\) and would come out incomplete \(2.2\)/);
    // The example as shown, every other fact unknown, flips as it says.
    for (const c of cs) {
      const read = exampleCase(spec, c.example_facts);
      expect([evaluate(spec, read).outcome, evaluate(edited, read).outcome]).toEqual([c.from, c.to]);
    }
  }, 60_000);

  it("names the sections that decide, never a rule that only might apply", () => {
    // A rule leading to incomplete that only might apply (the sign-off is unknown) doesn't decide; 2.2 does.
    const s = applyEdits(spec, [{ op: "add_rule", rule: { ...rule("large-claim"), id: "unsigned", when: { fact: "director_signed", is: "no" }, then: "incomplete" } }]).spec;
    const c = { facts: { self_approved: "no" }, items: { lines: [{ name: "hotel", category: "hotel", cabin: "none", amount_band: "under_75", itemised_receipt: "yes", recipient_official: "no", pre_approved: "no" }] }, computed: { total_usd: 10, days_to_submit: 1 } };
    expect(evaluate(s, c).decided_by.map((h) => h.rule)).toEqual(["unsigned"]);   // the evaluator lists it as what holds the case back
    expect(decidingSections(s, c)).toEqual(["2.2"]);
    expect(decidingSections(s, { ...c, facts: { ...c.facts, director_signed: "no" } })).toEqual(["3.3"]);
  });

  it("works out every option: problems, the finding gone, new findings, flips and past decisions matched", async () => {
    const keep = await optionImpact(spec, receiptFinding, options[0], past, sop);
    expect(keep).toMatchObject({ keeps_rules: true, resolves: false, changes: [], flips: [], problems: [] });
    const fix = await optionImpact(spec, receiptFinding, options[1], past, sop);
    expect(fix).toMatchObject({ keeps_rules: false, resolves: true, new_findings: [], problems: [] });
    expect(fix.changes).toHaveLength(1);
    expect(fix.matches_past).toBe(past.filter((p) => evaluate(applyEdits(spec, options[1].edits).spec, p.case).outcome === p.decision).length);
    const broken = await optionImpact(spec, receiptFinding, { option: "x", says: "", edits: [{ op: "remove_rule", id: "nope" }] }, past, sop);
    expect(broken.problems).toEqual(["The edit removes rule nope, which the spec doesn't have."]);
  }, 60_000);

  it("finds a new problem an option would cause", async () => {
    // Returning a claim whenever the director's sign-off is unknown makes 4.2 decide on an unknown fact.
    const careless: OptionEdits = { option: "y", says: "", edits: [{ op: "replace_rule", rule: { ...rule("alcohol"),
      when: { any: [{ some: "lines", where: { fact: "category", is: "alcohol" } }, { fact: "director_signed", is_unknown: true }] } } }] };
    const r = await optionImpact(spec, receiptFinding, careless, past, sop);
    expect(r.resolves).toBe(false);
    expect(r.new_findings.map((f) => f.id)).toEqual(["unknown-alcohol"]);
  }, 60_000);

  it("doesn't count a problem as solved because its rule was renamed", async () => {
    expect((await checkSop(spec)).find((f) => f.id === "unknown-receipt")).toMatchObject(receiptFinding);
    const renamed: OptionEdits = { option: "z", says: "", edits: [{ op: "remove_rule", id: "receipt" }, { op: "add_rule", rule: { ...rule("receipt"), id: "receipt-2" } }] };
    const r = await optionImpact(spec, receiptFinding, renamed, past, sop);
    expect(r.resolves).toBe(false);
    expect(r.new_findings.map((f) => f.id)).toContain("unknown-receipt-2");
    expect(r).toMatchObject({ searched_items_per_list: 2, past_decided: past.length });
  }, 60_000);
});

describe("the next version", () => {
  const pane = async (): Promise<PaneSpecFile> => ({ domain: spec.domain, version: spec.version, spec_hash: specHash(spec),
    findings: (await checkSop(spec)).map((f) => f.id === "unknown-receipt" ? { ...f, question: "Return it or wait?", options: options.map((o) => o.option), option_edits: options, impact: shown(options) }
                                                                            : { ...f, question: null, options: [] }) });
  // What the pane showed under each option: the impact pnpm resolve worked out from those very edits.
  const shown = (os: OptionEdits[]) => os.map((o) => ({ option: o.option, of: impactKey(spec, o), problems: [] as string[] }));
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

  it("refuses an option that changed, or didn't hold up, after the owner saw what it would do", async () => {
    const p = await pane();
    const f = p.findings.find((x) => x.id === "unknown-receipt")!;
    // Someone edits the option by hand after pnpm resolve showed its impact.
    f.option_edits = [options[0], { ...options[1], edits: [{ op: "remove_rule", id: "receipt" }] }];
    expect((await nextSpec(spec, { path: "x" }, p, answer(options[1].option), past)).problems[0]).toMatch(/changed after the owner saw what it would do/);
    f.option_edits = options;
    f.impact = [f.impact![0], { ...f.impact![1], problems: ["Rule receipt quotes words that aren't in 4.1."] }];
    expect((await nextSpec(spec, { path: "x" }, p, answer(options[1].option), past)).problems[0]).toMatch(/can't be applied: Rule receipt quotes/);
    // Two options with one label: an answer can't say which it picked.
    f.option_edits = [options[0], options[1], { ...options[1], edits: [] }];
    expect((await nextSpec(spec, { path: "x" }, p, answer(options[1].option), past)).problems[0]).toMatch(/Two options for "Return it or wait\?" are called/);
  }, 60_000);

  it("says what the answers do together that no picked option showed", async () => {
    const p = await pane(), f = p.findings.find((x) => x.id === "unknown-receipt")!;
    f.impact = f.impact!.map((i) => ({ ...i, changes: [{ from: "return", to: "incomplete" }], resolves: true }));
    expect((await nextSpec(spec, { path: "x" }, p, answer(options[1].option), past)).notes).toEqual([]);
    f.impact = f.impact!.map((i) => ({ ...i, changes: [] }));
    const r = await nextSpec(spec, { path: "x" }, p, answer(options[1].option), past);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatch(/^Together, the answers make some cases go from return to incomplete, which no picked option showed alone/);
  }, 60_000);

  it("refuses two answers that change the same rule, naming both questions", async () => {
    const p = await pane();
    const drop45: OptionEdits[] = [{ option: "Drop 4.5", says: "", edits: [{ op: "replace_rule", rule: { ...receiptOnlyWhenMissing.rule } }] }];
    const other = { id: "dead-pre-approved-business", rule_ids: p.findings.find((f) => f.id === "dead-pre-approved-business")!.rule_ids, choice: "Drop 4.5", at: "t" };
    p.findings = p.findings.map((f) => f.id === other.id ? { ...f, question: "Keep 4.5?", options: ["Drop 4.5"],
      option_edits: drop45, impact: shown(drop45) } : f);
    const r = await nextSpec(spec, { path: "x" }, p, [...answer(options[1].option), other], past);
    expect(r.spec).toBeNull();
    expect(r.problems).toEqual([`The answers to "Return it or wait?" and "Keep 4.5?" both change the rule from 4.1; answer one of them again, then send.`]);
  }, 60_000);
});

describe("the pane's spec.json across runs", () => {
  it("shows an earlier answer that kept the rules, even over a rerun's empty answer", async () => {
    const r = await nextSpec(spec, { path: "spec/expenses-v1.json" }, {
      domain: spec.domain, version: 1, spec_hash: specHash(spec),
      findings: (await checkSop(spec)).map((f) => ({ ...f, question: f.id === "unknown-receipt" ? "Return it or wait?" : null, options: options.map((o) => o.option), option_edits: options,
        impact: options.map((o) => ({ option: o.option, of: impactKey(spec, o), problems: [] })) })) },
      [{ id: "unknown-receipt", rule_ids: ["receipt"], choice: options[0].option, at: "t" }], past);
    const v2 = r.spec!;
    const first = paneSpec(v2, await checkSop(v2), [], null);
    const answered = first.findings.find((f) => f.id === "unknown-receipt")!;
    expect(answered.answer).toEqual({ choice: options[0].option, at: "t", in_version: 1 });
    // The pane's file from the last run of this version says null; the version's own record still wins.
    const rerun = paneSpec(v2, await checkSop(v2), [], { ...first, findings: first.findings.map((f) => ({ ...f, answer: null, question: null })) });
    expect(rerun.findings.find((f) => f.id === "unknown-receipt")!.answer).toMatchObject({ in_version: 1 });
    // The answer is one of the finding's options, so the pane can show it as picked.
    expect(answered.options).toEqual([options[0].option]);
  }, 60_000);

  it("drops an impact the last run left once it no longer fits the finding's options", async () => {
    const out = paneSpec(spec, await checkSop(spec), [], null);
    const f = out.findings.find((x) => x.id === "unknown-receipt")!;
    Object.assign(f, { question: "q", options: ["a"], impact: [{ option: "a", of: "old" }], severity: "high" });
    await addImpact(out, spec, past);
    expect([f.impact, f.severity]).toEqual([undefined, undefined]);
  }, 60_000);

  it("reuses an option's impact only while the spec and its edits are the same", async () => {
    const out = paneSpec(spec, await checkSop(spec), [], null);
    const f = out.findings.find((x) => x.id === "unknown-receipt")!;
    Object.assign(f, { question: "q", options: options.map((o) => o.option), option_edits: options });
    expect(impactPending(out, spec)).toBe(1);
    f.impact = options.map((o) => ({ option: o.option, of: impactKey(spec, o) }));
    expect(impactPending(out, spec)).toBe(0);
    f.option_edits = [options[0], { ...options[1], edits: [] }];
    expect(impactPending(out, spec)).toBe(1);
  }, 60_000);
});

