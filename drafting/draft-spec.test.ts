// The checks on a drafted spec. A draft built from an approved spec's own decisions must pass them, and each way
// a draft can go wrong (a misquote, a missing section, an invented fact, a different threshold) must be caught.
// The saved runs replay offline, so these tests never call Claude.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { ROOT, loadSpec } from "../core/load.ts";
import { assemble, draftProblems, parseReply, quoted, review, wordMapDiffs, type Draft } from "./draft-spec.ts";
import { diffSpecs } from "../core/sop-checks.ts";
import { RUNS, check, replyOf, runProblems, verdict, type Run } from "./propose-spec.ts";
import type { Spec } from "../core/spec.ts";
import { readFact } from "../core/evaluate.ts";
import { shutdown } from "../core/z3.ts";

afterAll(shutdown);

const sopOf = (s: Spec) => readFileSync(join(ROOT, s.sop.file), "utf8");
// The approved spec's own decisions, in the shape Claude answers with.
const asDraft = (s: Spec): Draft => structuredClone({
  order: s.order, order_sop: s.order_sop, unknowns: s.unknowns,
  collections: Object.fromEntries(s.collections.map(({ key: _k, item: _i, ...rest }) => [_k, rest])),
  computed: s.computed.filter((c) => c.sum), maps: s.maps ?? {}, rules: s.rules, sections: [{ sop: "1", note: "names the outcomes" }], needs: [],
});

const expenses = loadSpec("spec/expenses-v1.json"), kyb = loadSpec("spec/kyb-v1.json");

describe("quotes", () => {
  const section = "Claims must be submitted within 60 days of the earliest expense on them. Reject a claim submitted 61 days or more after its earliest expense.";
  test("a sentence copied exactly is found, with spacing and markdown ignored", () => {
    expect(quoted(section, "Reject a claim  submitted 61 days or more after its earliest expense.")).toBe(true);
    expect(quoted("**Approve**: pay the claim.", "Approve: pay the claim.")).toBe(true);
  });
  const alcohol = "Alcohol is not reimbursable. Return any claim with a line for alcohol.";
  test("sentences joined by ... must each be whole, and in order", () => {
    expect(quoted(alcohol, "Alcohol is not reimbursable. ... Return any claim with a line for alcohol.")).toBe(true);
    expect(quoted(alcohol, "Return any claim with a line for alcohol. ... Alcohol is not reimbursable.")).toBe(false);
  });
  test("a quote can't drop words from inside a sentence, be part of one, or be only an ellipsis", () => {
    expect(quoted(alcohol, "Alcohol is ... reimbursable.")).toBe(false);          // drops the "not"
    expect(quoted(section, "Claims must be submitted ... after its earliest expense.")).toBe(false);  // drops the 60 days
    expect(quoted(alcohol, "reimbursable")).toBe(false);
    expect(quoted(alcohol, "...")).toBe(false);
    expect(quoted(alcohol, "…")).toBe(false);
  });
  test("a quote citing several sections takes whole sentences from each, each in one section", () => {
    expect(quoted([section, alcohol], "Reject a claim submitted 61 days or more after its earliest expense. ... Alcohol is not reimbursable.")).toBe(true);
    expect(quoted([section, alcohol], "Alcohol is not reimbursable.")).toBe(false);   // nothing from the first section
    expect(quoted([section, alcohol], "Reject ... any claim with a line for alcohol.")).toBe(false);  // stitched across sections
  });
  test("a paraphrase is not a quote", () => {
    expect(quoted(section, "Reject a claim submitted 60 days or more after its earliest expense.")).toBe(false);
    expect(quoted(section, "")).toBe(false);
  });
});

test("word maps: a word read as the same value is no difference, whatever its case", () => {
  const facts = [{ key: "category", per: "lines", values: ["gift", "other"] }];
  const a = { facts, maps: { category: { "present": "gift" } } } as unknown as Spec;
  const b = { facts, maps: { category: { "present": "gift", "gift": "gift", "souvenir": "gift" } } } as unknown as Spec;
  expect(wordMapDiffs(a, b)).toEqual([{ fact: "category", word: "souvenir", approved: null, draft: "gift" }]);
  // The evaluator agrees: "Gift" is gift with or without a map, and " Present " goes through it.
  for (const s of [a, b]) expect([readFact(s, "category", "Gift"), readFact(s, "category", " Present ")]).toEqual(["gift", "gift"]);
});

test("the reply's last json block is the draft", () => {
  const reply = 'Thinking aloud:\n```json\n{"order": []}\n```\nFinal:\n```json\n{"order": ["a"]}\n```';
  expect(parseReply(reply).order).toEqual(["a"]);
  expect(() => parseReply("no json here")).toThrow();
});

describe("a draft with the approved spec's own decisions", () => {
  test("expenses: no problems, the same Z3 findings, the same outcome in every case", async () => {
    const r = await review(expenses, asDraft(expenses), sopOf(expenses));
    expect(r.problems).toEqual([]);
    expect(r.findings.map((f) => f.id).sort()).toEqual(r.approved_findings.map((f) => f.id).sort());
    expect(r.same_findings).toBe(true);
    expect(r.disagreements).toEqual([]);
    expect(r.matches).toBe(true);
  }, 60_000);

  test("KYB: the over-100% rule is a policy owner's answer, not an SOP sentence, so its quote fails", () => {
    const problems = draftProblems(kyb, asDraft(kyb), sopOf(kyb));
    expect(problems.some((p) => p.startsWith("Rule ownership-over-100 quotes words that aren't in 3.3"))).toBe(true);
  });
});

describe("each way a draft goes wrong is caught", () => {
  const sop = sopOf(expenses);
  const edit = (f: (d: Draft) => void) => { const d = asDraft(expenses); f(d); return d; };

  test("a misquoted rule", () => {
    const d = edit((d) => { d.rules.find((r) => r.id === "late")!.text = "Reject a claim submitted 60 days or more after its earliest expense."; });
    expect(draftProblems(expenses, d, sop)).toEqual([expect.stringContaining("Rule late quotes words that aren't in 3.1")]);
  });

  test("a section left out, with no rule and no note", () => {
    const d = edit((d) => { d.rules = d.rules.filter((r) => r.id !== "alcohol"); });
    expect(draftProblems(expenses, d, sop)).toEqual(["Section 4.2 isn't accounted for: no rule and no note."]);
  });

  test("a section left out on purpose, with a note: listed for a person, and the comparison finds what it changes", async () => {
    const d = edit((d) => { d.rules = d.rules.filter((r) => r.id !== "alcohol"); d.sections.push({ sop: "4.2", note: "left out" }); });
    const r = await review(expenses, d, sop);
    expect(r.problems).toEqual([]);
    expect(r.noted).toContainEqual({ sop: "4.2", note: "left out" });
    expect(r.disagreements.map((x) => [x.approved, x.draft])).toContainEqual(["return", "approve"]);
  }, 60_000);

  test("a dead rule left out with a note: the outcomes are the same, but Z3's findings aren't, so it doesn't match", async () => {
    const d = edit((d) => { d.rules = d.rules.filter((r) => r.id !== "pre-approved-business"); d.sections.push({ sop: "4.5", note: "background" }); });
    const r = await review(expenses, d, sop);
    expect(r.problems).toEqual([]);
    expect(r.disagreements).toEqual([]);
    expect(r.same_findings).toBe(false);
    expect(r.matches).toBe(false);
  }, 60_000);

  test("a rule citing every section, quoting one sentence, doesn't account for the others", () => {
    const d = edit((d) => { d.rules = d.rules.filter((r) => r.id === "late"); d.rules[0].sop = "3.1, 3.2, 4.2"; });
    expect(draftProblems(expenses, d, sop)).toContainEqual(expect.stringContaining("Rule late quotes words that aren't in 3.1, 3.2, 4.2"));
  });

  test("a sentence the draft says needs a fact must be quoted too", () => {
    const d = edit((d) => { d.needs = [{ sop: "4.2", text: "Alcohol is reimbursable.", fact: "made up" }]; });
    expect(draftProblems(expenses, d, sop)).toEqual([expect.stringContaining("A sentence that needs a fact (made up) quotes words that aren't in 4.2")]);
  });

  test("the comparison says how far it looked: a change that needs three lines isn't seen with two", async () => {
    const some = (c: string) => ({ some: "lines", where: { fact: "category", is: c } });
    const d = edit((d) => { const r = d.rules.find((r) => r.id === "late")!; r.when = { any: [r.when, { all: [some("airfare"), some("hotel"), some("meals")] }] } as Draft["rules"][number]["when"]; });
    const r = await review(expenses, d, sop);
    expect([r.slots, r.disagreements, r.matches]).toEqual([2, [], true]);
    expect((await diffSpecs(expenses, assemble(expenses, d), { slots: 3 })).map((x) => [x.from, x.to])).toContainEqual(["approve", "reject"]);
  }, 300_000);

  test("a fact the pack doesn't supply", () => {
    const d = edit((d) => { d.rules[0].when = { fact: "claimant_is_contractor", is: "yes" }; });
    expect(draftProblems(expenses, d, sop)).toEqual(["Rule late uses a fact that isn't declared: claimant_is_contractor."]);
  });

  test("a computed fact the pack works out, redefined", () => {
    const d = edit((d) => { d.computed = [{ key: "total_usd", numeric: true, sum: [{ computed: "days_to_submit" }], sop: "3.3", text: "A claim totalling $5,000 or more needs the Finance Director's sign-off." }]; });
    expect(draftProblems(expenses, d, sop)).toContain("The draft redefines total_usd, which the pack computes.");
  });

  test("a threshold one day off: the comparison gives a case for a person", async () => {
    const d = edit((d) => { const r = d.rules.find((r) => r.id === "late")!; r.when = { computed: "days_to_submit", at_least: 60 }; });
    const r = await review(expenses, d, sop);
    expect(r.problems).toEqual([]);
    expect(r.matches).toBe(false);
    expect(r.disagreements.map((x) => [x.approved, x.draft])).toContainEqual(["approve", "reject"]);
  }, 60_000);
});

// Every saved run holds together and checks the same way again from the text of its response, with no call to Claude.
const runs = existsSync(RUNS) ? readdirSync(RUNS).filter((f) => f.endsWith(".json")) : [];
const load = (f: string): Run => JSON.parse(readFileSync(join(RUNS, f), "utf8"));
describe.runIf(runs.length)("saved runs replay offline", () => {
  test.each(runs)("%s", async (f) => {
    const run = load(f);
    expect(runProblems(run).broken).toEqual([]);
    const again = await check(loadSpec(run.approved_spec), replyOf(run.response));
    expect(verdict(again)).toEqual(verdict(run.rechecks?.at(-1) ?? run));
  }, 120_000);

  test("a run whose reply was swapped, or whose prompt was edited, doesn't hold together", () => {
    const run = load(runs[0]);
    expect(runProblems({ ...run, reply: run.reply + " " }).broken).toEqual(["The saved reply isn't the text of the saved response; the run file has been edited."]);
    expect(runProblems({ ...run, prompt: run.prompt + " " }).broken).toEqual(["The saved prompt doesn't match its hash; the run file has been edited."]);
  });
});

test("a refusal has no text, so it is saved as a reply that isn't a draft", async () => {
  const refusal = { content: [], stop_reason: "refusal" } as unknown as Run["response"];
  expect(replyOf(refusal)).toBe("");
  const r = await check(expenses, replyOf(refusal));
  expect([r.draft, r.review, typeof r.parse_error]).toEqual([null, null, "string"]);
});
