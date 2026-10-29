import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate, type Case, type Result } from "../evaluate.ts";
import { ROOT, loadSpec } from "../load.ts";
import type { Spec } from "../spec.ts";

// agreement.json holds the answers of the TypeScript evaluator the Dafny one replaced: on 200 random specs and
// cases, and on 200 pack cases with random facts changed (odd case, unknown and undeclared words, numbers at the
// thresholds, a list left out). The two must give the same answer on every one, to the note and the sum.
type Saved = { spec: number | string; case: Case; result: unknown };
const saved: { specs: Spec[]; cases: Saved[] } = JSON.parse(readFileSync(`${ROOT}core/dafny/agreement.json`, "utf8"));
const packs: Record<string, Spec> = {};
const specOf = (s: number | string) => (typeof s === "number" ? saved.specs[s] : (packs[s] ??= loadSpec(s)));

const compact = (r: Result) => ({ outcome: r.outcome, applied: r.applied.map((h) => h.rule),
  might_apply: r.might_apply.map((h) => [h.rule, h.because ?? []]), decided_by: r.decided_by.map((h) => h.rule),
  notes: r.notes, counts: r.counts, sums: r.sums });

describe("the Dafny evaluator agrees with the TypeScript one it replaced", () => {
  it("on 400 saved cases", () => {
    expect(saved.cases.length).toBe(400);
    for (const s of saved.cases) expect(compact(evaluate(specOf(s.spec), s.case))).toEqual(s.result);
  });
});
