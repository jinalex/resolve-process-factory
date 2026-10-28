import { afterAll, describe, expect, it } from "vitest";
import { kybCopies, randomSop } from "../bench/random-sop.ts";
import { slice } from "./slice.ts";
import { checkSop, diffSpecs, forgetAnswers } from "./sop-checks.ts";
import type { Spec } from "./spec.ts";
import { domains, shutdown } from "./z3.ts";

afterAll(shutdown);

const brief = (fs: Awaited<ReturnType<typeof checkSop>>) => fs.map((f) => [f.id, ...f.rule_ids].join(" "));

// The checks ask about one group of rules at a time. They must find exactly what asking about the whole SOP
// at once finds, on SOPs whose sections are tied together in different ways.
describe("checking groups of rules gives the same answers as checking the whole SOP", () => {
  for (const [label, spec] of [["KYB", kybCopies(1)]] as const) {
    it(label, async () => {
      forgetAnswers();
      const whole = brief(await checkSop(spec, { groups: "whole" }));
      for (const groups of ["auto", "split-all"] as const) {
        forgetAnswers();
        expect(brief(await checkSop(spec, { groups }))).toEqual(whole);
      }
    }, 300000);
  }
  for (const [seed, tangle] of [[1, 0.05], [2, 0.3], [3, 0.6], [4, 0.3], [5, 0.1]] as const) {
    it(`made-up SOP ${seed}, tangle ${tangle}`, async () => {
      const spec = randomSop(14, { seed, tangle, perSection: 5 });
      forgetAnswers();
      const whole = brief(await checkSop(spec, { groups: "whole" }));
      for (const groups of ["auto", "split-all"] as const) {
        forgetAnswers();
        expect(brief(await checkSop(spec, { groups }))).toEqual(whole);
      }
      expect(whole.length).toBeGreaterThan(0);
    }, 120000);
  }

  it("and the same changes between two versions", async () => {
    const a = randomSop(12, { seed: 6, tangle: 0.3, perSection: 4 }), b: Spec = structuredClone(a);
    b.version = 2;
    b.rules[3].then = "decline";
    b.rules[9].when = { not: b.rules[9].when };
    const pairs = (cs: Awaited<ReturnType<typeof diffSpecs>>) => cs.map((c) => `${c.from} -> ${c.to}`);
    forgetAnswers();
    const whole = pairs(await diffSpecs(a, b, { groups: "whole" }));
    for (const groups of ["auto", "split-all"] as const) {
      forgetAnswers();
      expect(pairs(await diffSpecs(a, b, { groups }))).toEqual(whole);
    }
    expect(whole.length).toBeGreaterThan(0);
  }, 120000);
});

describe("splitting an SOP into groups", () => {
  const two: Spec = {
    domain: "test", version: 1, sop: { file: "", revision: "" }, order: ["decline", "incomplete", "approve"], order_sop: "2.1",
    unknowns: { sop: "2.2", text: "", then: "incomplete" }, collections: [{ key: "people", item: "person" }], computed: [], lists: {},
    facts: [{ key: "a", per: "case", values: ["yes", "no"] }, { key: "b", per: "case", values: ["yes", "no"] },
            { key: "c", per: "case", values: ["yes", "no"] }, { key: "pep", per: "people", values: ["yes", "no"] }],
    rules: [
      { id: "r1", sop: "1", text: "", then: "decline", when: { fact: "a", is: "yes" } },
      { id: "r2", sop: "2", text: "", then: "incomplete", when: { all: [{ fact: "a", is: "no" }, { fact: "b", is: "yes" }] } },
      { id: "r3", sop: "3", text: "", then: "decline", when: { fact: "c", is: "yes" } },
      { id: "r4", sop: "4", text: "", then: "decline", when: { some: "people", where: { fact: "pep", is: "yes" } } },
      { id: "r5", sop: "5", text: "", then: "incomplete", when: { all: [{ fact: "c", is: "no" }, { some: "people", where: { fact: "pep", is: "no" } }] } },
    ],
  };
  const ids = (sp: Spec) => slice([sp], domains(sp)).groups.map((g) => g.entries.map((e) => e.rule.id).join(" ")).sort();

  it("puts rules in one group exactly when they are linked by shared facts", () => {
    expect(ids(two)).toEqual(["r1 r2", "r3 r4 r5"]);
    // Adding a rule that reads a and c ties everything together, unless a and c are split on.
    const joined: Spec = { ...two, rules: [...two.rules, { id: "r6", sop: "6", text: "", then: "decline", when: { all: [{ fact: "a", is: "yes" }, { fact: "c", is: "yes" }] } }] };
    const { groups, split } = slice([joined], domains(joined));
    expect(split).toEqual(["fact:a", "fact:c", "items:people"]);
    expect(groups.map((g) => g.entries.map((e) => e.rule.id).join(" ")).sort()).toEqual(["r1", "r2", "r3", "r4 r5", "r6"]);
  });

  it("never separates two rules that read the same fact, unless that fact is split on", () => {
    for (const tangle of [0, 0.1, 0.3]) {
      const spec = randomSop(80, { seed: 9, tangle });
      const { groups, split } = slice([spec], domains(spec));
      const where = new Map<string, number>();
      groups.forEach((g, i) => g.entries.forEach((e) => e.reads.forEach((a) => {
        if (split.includes(a)) return;
        expect(where.get(a) ?? i).toBe(i);
        where.set(a, i);
      })));
    }
  });
});
