// Z3's encoding of a spec is a second copy of the evaluator, and Z3's findings are only as good as that copy. So
// the two must agree on random specs and cases (core/arbitrary.ts), not only on a pack's spec.
import { afterAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { evaluate } from "./evaluate.ts";
import { Encoder, shutdown, z3Context } from "./z3.ts";
import { checkSop, exampleFacts, forgetAnswers } from "./sop-checks.ts";
import { ruleFormulas } from "./rule-formulas.ts";
import { loadSpec } from "./load.ts";
import { base, refinedArb } from "./arbitrary.ts";

afterAll(shutdown);

describe("Z3's encoding", () => {
  it("agrees with the evaluator on any spec and any case: the outcome, and which rules apply and which might", async () => {
    const ctx = await z3Context();
    await fc.assert(fc.asyncProperty(refinedArb, async ({ spec, c }) => {
      const enc = new Encoder(ctx, spec, 3);
      const s = enc.symCase("agree");
      const { rules, outcome } = enc.run(s);
      const solver = new ctx.Solver();
      for (const d of [...s.domain, ...enc.pin(s, c)]) solver.add(d);
      expect(await solver.check()).toBe("sat");
      const m = solver.model(), r = evaluate(spec, c);
      const holds = (x: (typeof rules)[number]["applies"]) => m.eval(x).toString() === "true";
      expect(rules.filter((x) => holds(x.applies)).map((x) => x.rule.id)).toEqual(r.applied.map((h) => h.rule));
      expect(rules.filter((x) => holds(x.might)).map((x) => x.rule.id)).toEqual(r.might_apply.map((h) => h.rule));
      expect(spec.order[Number(m.eval(outcome).toString())]).toBe(r.outcome);
      solver.release();
    }), { numRuns: 300 });
  }, 300_000);
});

describe("found in the PR #16 review", () => {
  it("keeps a fraction exact in Z3's example case, so it can't cross a threshold (Codex)", async () => {
    // Just under 0.1: read as a float it would be 0.1, and the rule would apply to Z3's own example.
    const spec = { ...base(), order: ["o1", "o2"], unknowns: { sop: "1", text: "", then: "o2" }, collections: [{ key: "items", item: "item" }],
      rules: [{ id: "r", sop: "1", text: "", then: "o1", when: { fact: "n", at_least: 0.1 } }] };
    const ctx = await z3Context(), enc = new Encoder(ctx, spec, 1), s = enc.symCase("exact"), solver = new ctx.Solver();
    for (const d of [...s.domain, ...enc.pin(s, { facts: { n: "99999999999999999/1000000000000000000" }, items: { items: [] }, computed: {} })]) solver.add(d);
    expect(await solver.check()).toBe("sat");
    const ex = enc.readCase(solver.model(), s);
    expect(ex.facts.n).toBe("99999999999999999/1000000000000000000");
    expect(evaluate(spec, { ...ex, items: { items: [] } }).outcome).toBe("o2");
    solver.release();
  });

  it("shows a list the example case doesn't give (Codex, Gemini)", () => {
    expect(exampleFacts({ facts: {}, items: { items: null }, computed: {} }, new Set()))
      .toEqual([{ key: "items", name: "items", value: "not given", list: "items" }]);
  });

  it("no longer crashes on a sum over a list of a case fact: the spec is refused first (Codex)", async () => {
    const spec = { ...base(), order: ["o1", "o2"], unknowns: { sop: "1", text: "", then: "o2" }, collections: [{ key: "items", item: "item" }],
      rules: [{ id: "r", sop: "1", text: "", then: "o1", when: { sum: [{ sum_over: "items", of: "n" }], at_least: 25 } }] };
    await expect(checkSop(spec)).rejects.toThrow("isn't a fact of each item there");
  });
});

describe("one Z3 context for the whole process", () => {
  // Z3 can't work on two questions in one context at once: two checks run together used to crash it.
  it("runs checks started together one after another, with the same findings as one at a time", async () => {
    const kyb = loadSpec("spec/kyb-v1.json"), expenses = loadSpec("spec/expenses-v1.json");
    forgetAnswers();
    const together = await Promise.all([checkSop(kyb), checkSop(expenses), ruleFormulas(kyb)]);
    forgetAnswers();
    const ids = (fs: { id: string }[]) => fs.map((f) => f.id);
    expect(ids(together[0])).toEqual(ids(await checkSop(kyb)));
    expect(ids(together[1])).toEqual(ids(await checkSop(expenses)));
    expect(together[2].formulas.map((f) => f.id)).toEqual(kyb.rules.map((r) => r.id));
  }, 300_000);
});
