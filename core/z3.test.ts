// Z3's encoding of a spec is a second copy of the evaluator, and Z3's findings are only as good as that copy. So
// the two must agree on random specs and cases (core/arbitrary.ts), not only on a pack's spec.
import { afterAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { evaluate } from "./evaluate.ts";
import { Encoder, shutdown, z3Context } from "./z3.ts";
import { refinedArb } from "./arbitrary.ts";

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
