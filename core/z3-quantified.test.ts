// Spike: the quantified encoding (core/z3-quantified.ts) must agree with the evaluator case by case, and the checks
// must find the same things with it as with slots.
import { afterAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { kybCopies, randomSop } from "../bench/random-sop.ts";
import { refinedArb } from "./arbitrary.ts";
import { evaluate } from "./evaluate.ts";
import { checkSop, diffSpecs, forgetAnswers } from "./sop-checks.ts";
import type { Spec } from "./spec.ts";
import { QuantEncoder } from "./z3-quantified.ts";
import { shutdown, z3Context } from "./z3.ts";

afterAll(shutdown);

const brief = (fs: Awaited<ReturnType<typeof checkSop>>) => fs.map((f) => [f.id, ...f.rule_ids].join(" "));

describe("the quantified encoding", () => {
  it("agrees with the evaluator on any spec and any case: the outcome, and which rules apply and which might", async () => {
    const ctx = await z3Context();
    await fc.assert(fc.asyncProperty(refinedArb, async ({ spec, c }) => {
      const enc = new QuantEncoder(ctx, spec, 3);
      const s = enc.symCase("qagree");
      const { rules, outcome } = enc.run(s);
      const solver = new ctx.Solver();
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
    const slots = brief(await checkSop(spec));
    for (const encoding of ["quantified", "auto"] as const) {
      forgetAnswers();
      expect(brief(await checkSop(spec, { encoding }))).toEqual(slots);
    }
  }, 600_000);

  for (const [seed, tangle] of [[1, 0.05], [2, 0.3], [3, 0.6], [4, 0.3], [5, 0.1]] as const) {
    it(`finds what the slots find on made-up SOP ${seed}, tangle ${tangle}`, async () => {
      const spec = randomSop(14, { seed, tangle, perSection: 5 });
      forgetAnswers();
      const slots = brief(await checkSop(spec));
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
    const pairs = (cs: Awaited<ReturnType<typeof diffSpecs>>) => cs.map((c) => `${c.from} -> ${c.to}`);
    forgetAnswers();
    const slots = pairs(await diffSpecs(a, b));
    forgetAnswers();
    expect(pairs(await diffSpecs(a, b, { encoding: "quantified" }))).toEqual(slots);
  }, 300_000);

});
