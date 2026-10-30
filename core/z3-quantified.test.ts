// Spike: the quantified encoding (core/z3-quantified.ts) must agree with the evaluator case by case, and the checks
// must find the same things with it as with slots.
import { afterAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { kybCopies, randomSop } from "../bench/random-sop.ts";
import { refinedArb } from "./arbitrary.ts";
import { evaluate } from "./evaluate.ts";
import { checkSop, diffSpecs, forgetAnswers, sopCoverage, unusedFacts } from "./sop-checks.ts";
import { type Condition, type Spec, validateSpec } from "./spec.ts";
import { QuantEncoder } from "./z3-quantified.ts";
import { shutdown, z3Context } from "./z3.ts";

afterAll(shutdown);

// refinedArb's specs all add their list up, and a list that is added up keeps its slots. Without the sums the
// list is quantified (found in the PR #24 review: the agreement test never quantified anything).
const unsummedArb = refinedArb.map(({ spec, c }) => ({ c, spec: {
  ...spec, computed: spec.computed.filter((k) => k.key !== "total"),
  rules: spec.rules.filter((r) => !/sum_over|"total"/.test(JSON.stringify(r.when))),
} })).filter(({ spec }) => spec.rules.length > 0 && validateSpec(spec).length === 0);

const tiny = (rules: Spec["rules"], facts: Spec["facts"], more: Partial<Spec> = {}): Spec => ({
  domain: "t", version: 1, sop: { file: "", revision: "" }, order: ["decline", "incomplete", "approve"], order_sop: "2.1",
  unknowns: { sop: "2.2", text: "", then: "incomplete" }, collections: [{ key: "items", item: "item" }], computed: [], lists: {}, facts, rules, ...more,
});
const pairs = (cs: Awaited<ReturnType<typeof diffSpecs>>) => cs.map((c) => `${c.from} -> ${c.to}`);

const brief = (fs: Awaited<ReturnType<typeof checkSop>>) => fs.map((f) => [f.id, ...f.rule_ids].join(" "));

describe("the quantified encoding", () => {
  it("agrees with the evaluator on any spec and any case: the outcome, and which rules apply and which might", async () => {
    const ctx = await z3Context();
    await fc.assert(fc.asyncProperty(unsummedArb, async ({ spec, c }) => {
      const enc = new QuantEncoder(ctx, spec, 3);
      expect(enc.quantified("items")).toBe(true);
      const s = enc.symCase("qagree");
      const { rules, outcome } = enc.run(s);
      const solver = new ctx.Solver();
      enc.configure(solver);
      for (const d of [...s.domain, ...enc.pin(s, c)]) solver.add(d);
      expect(await solver.check()).toBe("sat");
      const m = solver.model(), r = evaluate(spec, c);
      const holds = (x: (typeof rules)[number]["applies"]) => m.eval(x, true).toString() === "true";
      expect(rules.filter((x) => holds(x.applies)).map((x) => x.rule.id)).toEqual(r.applied.map((h) => h.rule));
      expect(rules.filter((x) => holds(x.might)).map((x) => x.rule.id)).toEqual(r.might_apply.map((h) => h.rule));
      expect(spec.order[Number(m.eval(outcome, true).toString())]).toBe(r.outcome);
      solver.release();
    }), { numRuns: 300 });
  }, 600_000);

  it("finds what the slots find on KYB", async () => {
    const spec = kybCopies(1);
    forgetAnswers();
    const slots = brief(await checkSop(spec, { encoding: "slots" }));
    for (const encoding of ["quantified", "auto"] as const) {
      forgetAnswers();
      expect(brief(await checkSop(spec, { encoding }))).toEqual(slots);
    }
  }, 600_000);

  for (const [seed, tangle] of [[1, 0.05], [2, 0.3], [3, 0.6], [4, 0.3], [5, 0.1]] as const) {
    it(`finds what the slots find on made-up SOP ${seed}, tangle ${tangle}`, async () => {
      const spec = randomSop(14, { seed, tangle, perSection: 5 });
      forgetAnswers();
      const slots = brief(await checkSop(spec, { encoding: "slots" }));
      for (const groups of ["auto", "whole"] as const) {
        forgetAnswers();
        expect(brief(await checkSop(spec, { encoding: "quantified", groups }))).toEqual(slots);
      }
    }, 300_000);
  }

  it("and the same changes between two versions", async () => {
    const a = randomSop(12, { seed: 6, tangle: 0.3, perSection: 4 }), b: Spec = structuredClone(a);
    b.version = 2;
    b.rules[3].then = "decline";
    b.rules[9].when = { not: b.rules[9].when };
    forgetAnswers();
    const slots = pairs(await diffSpecs(a, b, { encoding: "slots" }));
    forgetAnswers();
    expect(pairs(await diffSpecs(a, b, { encoding: "quantified" }))).toEqual(slots);
  }, 300_000);

  it("reads a value only the other version declares as unknown, as slots do", async () => {
    // Found in the PR #24 review: one person with status "no" is incomplete under version A (values: yes) and
    // approved under version B (values: yes, no). The quantified encoding read "no" as a known value in both.
    const rule = (i: number) => ({ id: `r${i}`, sop: "1", text: "", then: "decline", when: { some: "items", where: { fact: "status", is: "yes" } } });
    const a = tiny([0, 1, 2, 3, 4, 5, 6].map(rule), [{ key: "status", per: "items", values: ["yes"] }]);
    const b = { ...tiny(a.rules, [{ key: "status", per: "items", values: ["yes", "no"] }]), version: 2 };
    for (const encoding of ["slots", "quantified", "auto"] as const) {
      forgetAnswers();
      expect(pairs(await diffSpecs(a, b, { encoding }))).toEqual(["incomplete -> approve"]);
    }
  }, 300_000);

  it("reads a case back as plain values", async () => {
    // Found in the PR #24 review: without equation solving off, 46 of 80 such runs gave the outcome as a formula.
    const ctx = await z3Context();
    const spec = tiny([{ id: "r", sop: "1", text: "", then: "decline", when: { some: "items", where: { fact: "g", is: "yes" } } }], [{ key: "g", per: "items", values: ["yes", "no"] }]);
    for (let i = 0; i < 40; i++) for (const items of [[{ name: "a", g: "unknown" }, { name: "b", g: "no" }], [{ name: "a", g: "yes" }, { name: "b", g: "no" }]]) {
      const enc = new QuantEncoder(ctx, spec, 3), s = enc.symCase(i % 2 ? "plain" : `plain${i}`), { outcome, rules } = enc.run(s), solver = new ctx.Solver();
      enc.configure(solver);
      for (const d of [...s.domain, ...enc.pin(s, { facts: {}, items: { items }, computed: {} })]) solver.add(d);
      expect(await solver.check()).toBe("sat");
      expect(solver.model().eval(outcome, true).toString()).toMatch(/^\d+$/);
      expect(solver.model().eval(rules[0].applies, true).toString()).toMatch(/^(true|false)$/);
      solver.release();
    }
  }, 300_000);

  it("says how many items unused facts covered when a merged question fell back", async () => {
    // Found in the PR #24 review: unusedFacts asks one question for groups that share a split-on fact, and that
    // question's fallback never reached sopCoverage, which said any number while the proof said up to 12.
    const P = (f: string): Condition => ({ all: ["a", "b", "c"].map((v) => ({ some: "items", where: { fact: f, is: v } })) });
    const T: Condition = { any: [{ fact: "flag", is: "yes" }, { fact: "flag", is: "no" }, { fact: "flag", is_unknown: true }] };
    const spec = tiny([0, 1, 2].flatMap((i) => ["f", "g"].map((f) => ({ id: `${f}${i}`, sop: "1", text: "", then: "decline", when: { all: [P(f), T] } }))),
      [{ key: "f", per: "items", values: ["a", "b", "c"] }, { key: "g", per: "items", values: ["a", "b", "c"] }, { key: "flag", per: "case", values: ["yes", "no"] }]);
    forgetAnswers();
    const asks = (await unusedFacts(spec, { budgetMs: 1 })).map((f) => f.proof.asks);
    const unused = sopCoverage(spec, { budgetMs: 1 }).find((c) => c.check === "unused")!;
    expect(unused.upTo).not.toBeNull();
    for (const a of asks) expect(a).toContain(`up to ${unused.upTo} items`);
    forgetAnswers();
  }, 300_000);

  it("gives two groups their own example questions", async () => {
    // Found in the PR #24 review: two groups version A gives no rules shared one cached question, and the diff crashed.
    const f0 = tiny([{ id: "r0", sop: "1", text: "", then: "decline", when: { fact: "f0", is: "yes" } }],
      [{ key: "f0", per: "case", values: ["yes", "no"] }, { key: "p1", per: "people", values: ["yes", "no"] }, { key: "p2", per: "people", values: ["yes", "no"] }],
      { order: ["decline", "escalate", "request_docs", "incomplete", "approve"], collections: [{ key: "people", item: "person" }] });
    const f1 = { ...f0, version: 2, rules: [...f0.rules,
      { id: "r1", sop: "2", text: "", then: "escalate", when: { some: "people", where: { fact: "p1", is: "yes" } } },
      { id: "r2", sop: "3", text: "", then: "request_docs", when: { some: "people", where: { fact: "p2", is: "yes" } } }] };
    forgetAnswers();
    const slots = pairs(await diffSpecs(f0, f1, { encoding: "slots" }));
    forgetAnswers();
    expect(pairs(await diffSpecs(f0, f1, { encoding: "quantified" }))).toEqual(slots);
  }, 300_000);
});
