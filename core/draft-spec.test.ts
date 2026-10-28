// The checks on a drafted spec. A draft built from an approved spec's own decisions must pass them, and each way
// a draft can go wrong (a misquote, a missing section, an invented fact, a different threshold) must be caught.
// The saved runs replay offline, so these tests never call Claude.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { ROOT, loadSpec } from "./load.ts";
import { draftProblems, parseReply, quoted, review, type Draft } from "./draft-spec.ts";
import { RUNS, check, type Run } from "./propose-spec.ts";
import type { Spec } from "./spec.ts";
import { shutdown } from "./z3.ts";

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
  test("pieces joined by ... must each be there, in order", () => {
    expect(quoted(section, "Claims must be submitted ... after its earliest expense.")).toBe(true);
    expect(quoted(section, "after its earliest expense. ... Claims must be submitted")).toBe(false);
  });
  test("a paraphrase is not a quote", () => {
    expect(quoted(section, "Reject a claim submitted 60 days or more after its earliest expense.")).toBe(false);
    expect(quoted(section, "")).toBe(false);
  });
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
    expect(r.findings.map((f) => f.id).sort()).toEqual([...r.approved_findings].sort());
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

  test("a section left out on purpose, with a note: the comparison finds what it changes", async () => {
    const d = edit((d) => { d.rules = d.rules.filter((r) => r.id !== "alcohol"); d.sections.push({ sop: "4.2", note: "left out" }); });
    const r = await review(expenses, d, sop);
    expect(r.problems).toEqual([]);
    expect(r.disagreements.map((x) => [x.approved, x.draft])).toContainEqual(["return", "approve"]);
  }, 60_000);

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

// Every saved run checks the same way again from its raw reply, with no call to Claude.
const runs = existsSync(RUNS) ? readdirSync(RUNS).filter((f) => f.endsWith(".json")) : [];
describe.runIf(runs.length)("saved runs replay offline", () => {
  test.each(runs)("%s", async (f) => {
    const run: Run = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
    const again = await check(loadSpec(run.approved_spec), run.reply);
    const shape = (r: Run["review"]) => r && { problems: r.problems, findings: r.findings.map((x) => x.id).sort(),
                                               disagreements: r.disagreements.map((x) => `${x.approved}->${x.draft}`).sort() };
    expect(shape(again.review)).toEqual(shape(run.review));
  }, 120_000);
});
