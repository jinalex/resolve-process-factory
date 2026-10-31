import { afterAll, describe, expect, it } from "vitest";
import { kybCopies, randomSop } from "../bench/random-sop.ts";
import { base } from "./arbitrary.ts";
import { slice } from "./slice.ts";
import { checkSop, diffCoverage, diffSpecs, forgetAnswers, sopCoverage } from "./sop-checks.ts";
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
    });
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
  });
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
    // Adding a rule that reads a and c ties everything together. Six rules are too few for splitting on a and c
    // to pay, so they stay one group unless every shared fact is split on.
    const joined: Spec = { ...two, rules: [...two.rules, { id: "r6", sop: "6", text: "", then: "decline", when: { all: [{ fact: "a", is: "yes" }, { fact: "c", is: "yes" }] } }] };
    const auto = slice([joined], domains(joined));
    expect(auto.split).toEqual([]);
    expect(auto.groups.map((g) => g.entries.map((e) => e.rule.id).join(" "))).toEqual(["r1 r2 r3 r4 r5 r6"]);
    const all = slice([joined], domains(joined), "split-all");
    expect(all.split).toEqual(["fact:a", "fact:c"]);
    expect(all.groups.map((g) => g.entries.map((e) => e.rule.id).join(" ")).sort()).toEqual(["r1", "r2", "r3", "r4 r5", "r6"]);
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

describe("found in the PR #18 review", () => {
  // A list's "who counts" rule reads a fact; a group that only adds the list up must still tell that fact's values apart.
  const gated = (): Spec => ({
    domain: "test", version: 1, sop: { file: "", revision: "" }, order: ["decline", "incomplete", "approve"], order_sop: "1",
    unknowns: { sop: "1", text: "", then: "incomplete" }, computed: [], lists: {},
    collections: [{ key: "people", item: "person", counts_when: { fact: "gate", is: "yes" } }],
    facts: [{ key: "gate", per: "case", values: ["no", "yes"] }, { key: "v", per: "people", numeric: true },
            ...[0, 1, 2, 3].map((i) => ({ key: `f${i}`, per: "case", values: ["no", "yes"] }))],
    rules: [{ id: "sum", sop: "1", text: "", then: "decline", when: { sum: [{ sum_over: "people", of: "v" }], at_least: 1 } },
            ...[0, 1, 2, 3].map((i) => ({ id: `r${i}`, sop: "1", text: "", then: "decline" as const,
              when: { all: [{ fact: "gate", is: "yes" }, { fact: `f${i}`, is: "yes" }] } }))],
  });
  it("tells apart the values of a fact that decides who counts in a summed list (Codex, Grok, Gemini)", async () => {
    forgetAnswers();
    const whole = brief(await checkSop(gated(), { groups: "whole" }));
    for (const groups of ["auto", "split-all"] as const) {
      forgetAnswers();
      expect(brief(await checkSop(gated(), { groups }))).toEqual(whole);
    }
    expect(whole.some((f) => f.startsWith("dead-sum"))).toBe(false);
  });

  it("ties a list together when only the other version adds it up (Codex, Grok)", async () => {
    const a: Spec = {
      domain: "test", version: 1, sop: { file: "", revision: "" }, order: ["decline", "escalate", "approve"], order_sop: "1",
      unknowns: { sop: "1", text: "", then: "escalate" }, computed: [], lists: {}, collections: [{ key: "people", item: "person" }],
      facts: [{ key: "x", per: "people", values: ["a", "b"] }, { key: "v", per: "people", numeric: true }],
      rules: [{ id: "both", sop: "1", text: "", then: "decline", when: { all: [{ some: "people", where: { fact: "x", is: "a" } }, { some: "people", where: { fact: "x", is: "b" } }] } }],
    };
    const b: Spec = { ...a, version: 2, rules: [
      { id: "two", sop: "1", text: "", then: "decline", when: { sum: [{ sum_over: "people", of: "v" }], at_least: 2 } },
      { id: "one", sop: "1", text: "", then: "escalate", when: { sum: [{ sum_over: "people", of: "v" }], at_least: 1 } }] };
    const pairs = async (groups: "whole" | "auto") => { forgetAnswers(); return (await diffSpecs(a, b, { groups })).map((c) => `${c.from} -> ${c.to}`); };
    expect(await pairs("auto")).toEqual(await pairs("whole"));
  });

  it("reads a value only the new version has as unknown in the old one (Grok)", async () => {
    const a: Spec = {
      domain: "test", version: 1, sop: { file: "", revision: "" }, order: ["decline", "incomplete", "approve"], order_sop: "1",
      unknowns: { sop: "1", text: "", then: "incomplete" }, computed: [], lists: {}, collections: [],
      facts: [{ key: "country", per: "case", values: ["us"] }],
      rules: [{ id: "us", sop: "1", text: "", then: "decline", when: { fact: "country", is: "us" } },
              { id: "unknown", sop: "1", text: "", then: "incomplete", when: { fact: "country", is_unknown: true } }],
    };
    const b: Spec = { ...a, version: 2, facts: [{ key: "country", per: "case", values: ["us", "fr"] }] };
    forgetAnswers();
    expect((await diffSpecs(a, b)).map((c) => `${c.from} -> ${c.to}`)).toEqual(["incomplete -> approve"]);
  });

  it("says how many items a check looked at when a list is added up: no number covers every case (Codex, Grok)", async () => {
    // Six people at 5/6 each reach 5; the people bound gives five slots.
    const a: Spec = { ...gated(), collections: [{ key: "people", item: "person" }],
      rules: [{ id: "one", sop: "1", text: "", then: "decline", when: { some: "people", where: { fact: "v", at_least: 1 } } }] };
    const b: Spec = { ...a, version: 2, rules: [...a.rules, { id: "sum", sop: "1", text: "", then: "decline", when: { sum: [{ sum_over: "people", of: "v" }], at_least: 5 } }] };
    expect(diffCoverage(a, a)).toBeNull();
    const n = diffCoverage(a, b)!;
    expect(n).toBeLessThan(6);
    forgetAnswers();
    expect(await diffSpecs(a, b)).toEqual([]);
    expect((await diffSpecs(a, b, { slots: 6 })).map((c) => `${c.from} -> ${c.to}`)).toEqual(["approve -> decline"]);
    expect(sopCoverage(b).every((c) => typeof c.upTo === "number")).toBe(true);
    expect(sopCoverage(a).map((c) => c.upTo)).toEqual([null, null, null]);
  });

  it("keeps what it found under the spec it was asked about, if the caller changes the spec meanwhile (Codex, Grok)", async () => {
    const spec = gated(), original = structuredClone(spec);
    forgetAnswers();
    const running = checkSop(spec);
    spec.rules[0].when = { any: [] };
    await running;
    const kept = brief(await checkSop(original));
    forgetAnswers();
    expect(kept).toEqual(brief(await checkSop(original)));
  });

  it("sees a change to what a sum adds up, though the rules read the same (Tenki)", async () => {
    const a: Spec = { ...base(), order: ["o1", "o2", "o3"], unknowns: { sop: "1", text: "", then: "o2" }, collections: [{ key: "items", item: "item" }],
      rules: [{ id: "r", sop: "1", text: "", then: "o1", when: { sum: [{ computed: "total" }], at_least: 25 } }] };
    const b: Spec = { ...a, version: 2, computed: [{ key: "flag" }, { key: "total", numeric: true, sum: [{ fact: "n" }] }] };
    forgetAnswers();
    // o3, the outcome with nothing against it, is apart from o2 for unknowns (validateSpec requires it).
    expect((await diffSpecs(a, b)).map((c) => `${c.from} -> ${c.to}`)).toEqual(["o1 -> o3", "o2 -> o1", "o2 -> o3", "o3 -> o1"]);
  });
});
