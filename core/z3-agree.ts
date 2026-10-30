// For tests: Z3's encoding must agree with the evaluator on one case: the outcome, and which rules apply and which
// might. A quantified encoding needs its solver configured, and its model's values read in full (complete), or a
// rule can look as if it agrees when Z3 never decided it.
import { expect } from "vitest";
import { type Case, evaluate } from "./evaluate.ts";
import type { Spec } from "./spec.ts";
import type { Encoder } from "./z3.ts";
import { QuantEncoder } from "./z3-quantified.ts";

// One symbolic case for the encoder, checked against the evaluator on each case it is given.
export function agreement(enc: Encoder, name = "agree") {
  const s = enc.symCase(name), { rules, outcome } = enc.run(s), complete = enc instanceof QuantEncoder;
  return async (spec: Spec, c: Case) => {
    const solver = new enc.ctx.Solver();
    if (enc instanceof QuantEncoder) enc.configure(solver);
    for (const d of [...s.domain, ...enc.pin(s, c)]) solver.add(d);
    expect(await solver.check()).toBe("sat");
    const m = solver.model(), r = evaluate(spec, c);
    const holds = (x: (typeof rules)[number]["applies"]) => m.eval(x, complete).toString() === "true";
    expect(rules.filter((x) => holds(x.applies)).map((x) => x.rule.id)).toEqual(r.applied.map((h) => h.rule));
    expect(rules.filter((x) => holds(x.might)).map((x) => x.rule.id)).toEqual(r.might_apply.map((h) => h.rule));
    expect(spec.order[Number(m.eval(outcome, complete).toString())]).toBe(r.outcome);
    solver.release();
  };
}
