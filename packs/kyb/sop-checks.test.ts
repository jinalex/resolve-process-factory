import { afterAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { type Case, evaluate } from "../../core/evaluate.ts";
import { checkSop, diffSpecs } from "../../core/sop-checks.ts";
import type { Spec } from "../../core/spec.ts";
import { Encoder, shutdown, z3Context } from "../../core/z3.ts";
import { kybSpec, loadExamples } from "./examples.ts";
import { type KybFacts, toCase } from "./facts.ts";

const spec = kybSpec();
afterAll(shutdown);

// Z3 and the evaluator must agree on one case: the outcome, and which rules apply and which might.
async function agree(sp: Spec, kase: Case, slots = 2) {
  const ctx = await z3Context();
  const enc = new Encoder(ctx, sp, slots);
  const s = enc.symCase("agree");
  const { rules, outcome } = enc.run(s);
  const solver = new ctx.Solver();
  for (const d of [...s.domain, ...enc.pin(s, kase)]) solver.add(d);
  expect(await solver.check()).toBe("sat");
  const m = solver.model(), r = evaluate(sp, kase);
  const holds = (x: (typeof rules)[number]["applies"]) => m.eval(x).toString() === "true";
  expect(rules.filter((x) => holds(x.applies)).map((x) => x.rule.id)).toEqual(r.applied.map((h) => h.rule));
  expect(rules.filter((x) => holds(x.might)).map((x) => x.rule.id)).toEqual(r.might_apply.map((h) => h.rule));
  expect(sp.order[Number(m.eval(outcome).toString())]).toBe(r.outcome);
}

describe("Z3 checks on the SOP as written", () => {
  it("finds the planted problems Z3 can find, and nothing else", async () => {
    const findings = await checkSop(spec);
    expect(findings.map((f) => [f.kind, f.id])).toEqual([
      ["contradiction", "dead-msb-licensed"],      // 5.3 can never apply: 5.2 always wins
      ["unknowns", "unknown-id-verified"],         // 3.4 asks for documents when an ID check is pending; 2.2 says incomplete
      ["contradiction", "unused-licence_verified"], // follows from 5.3: the licence check never matters
    ]);
    expect(findings[0].rule_ids).toEqual(["msb-licensed", "industry-restricted"]);
    expect(findings[1].example_facts).toEqual([{ key: "id_verified", name: "id verified", value: "unknown", list: "people", item: 1 }]);
    // What the expert reads: titles start with a capital, and outcomes have no underscores.
    expect(findings[2].title).toBe("Licence verified never changes an outcome");
    expect(findings[1].explain).toContain("leads to request docs only because a fact is unknown");
  }, 30000);

  it("finds nothing once 3.4 follows 2.2 and 5.3 is removed", async () => {
    const fixed: Spec = structuredClone(spec);
    fixed.rules = fixed.rules.filter((r) => r.id !== "msb-licensed");
    fixed.rules.find((r) => r.id === "id-verified")!.when = { some: "people", where: { fact: "id_verified", is: "no" } };
    fixed.facts = fixed.facts.filter((f) => f.key !== "licence_verified");
    expect(await checkSop(fixed)).toEqual([]);
  }, 30000);

  it("says a rule whose conditions can't all hold never applies, and blames no other rule", async () => {
    const v: Spec = structuredClone(spec);
    v.rules.push({ id: "impossible", sop: "9.9", text: "", then: "approve", when: { all: [{ fact: "excluded", is: "yes" }, { fact: "excluded", is: "no" }] } });
    const f = (await checkSop(v)).find((x) => x.id === "dead-impossible")!;
    expect(f.rule_ids).toEqual(["impossible"]);
    expect(f.title).toBe("9.9 can never apply");
  }, 30000);

  it("reports an unknowns finding only where the rule decides the case", async () => {
    // A rule that declines every case, so 3.4 never decides one.
    const v: Spec = structuredClone(spec);
    v.rules.push({ id: "always", sop: "9.8", text: "", then: "decline",
                   when: { any: [{ fact: "excluded", is: "yes" }, { fact: "excluded", is: "no" }, { fact: "excluded", is_unknown: true }] } });
    expect((await checkSop(v)).filter((f) => f.kind === "unknowns")).toEqual([]);
  }, 30000);

  it("compares versions whose lists differ", async () => {
    const v2: Spec = structuredClone(spec);
    v2.version = 2;
    v2.lists.sanctioned_countries = [...v2.lists.sanctioned_countries, "XX"];
    const changes = await diffSpecs(spec, v2);
    expect(changes.every((c) => c.to === "decline")).toBe(true);
    expect(changes.map((c) => c.from).sort()).toEqual(["approve", "escalate", "incomplete", "request_docs"]);
  }, 30000);

  it("shows what changes between two versions", async () => {
    const v2: Spec = structuredClone(spec);
    v2.version = 2;
    v2.rules.find((r) => r.id === "id-verified")!.when = { some: "people", where: { fact: "id_verified", is: "no" } };
    const changes = await diffSpecs(spec, v2);
    expect(changes.map((c) => `${c.from} -> ${c.to}`)).toEqual(["request_docs -> incomplete"]);
  }, 30000);

  it("compares two versions whatever order their facts are declared in", async () => {
    const v2: Spec = structuredClone(spec);
    v2.facts.reverse();
    expect(await diffSpecs(spec, v2)).toEqual([]);
  }, 30000);

  it("refuses, in a plain sentence, two versions with different numeric facts, or a broken spec", async () => {
    const v2: Spec = structuredClone(spec);
    v2.computed = v2.computed.filter((c) => c.key !== "registry_age_months");
    v2.rules = v2.rules.filter((r) => !JSON.stringify(r.when).includes("registry_age_months"));
    await expect(diffSpecs(spec, v2)).rejects.toThrow("different facts");
    const broken: Spec = structuredClone(spec);
    broken.rules[0].when = { fact: "no_such_fact", is: "yes" };
    await expect(checkSop(broken)).rejects.toThrow("fix them before running Z3");
  }, 30000);
});

// Inputs the Codex and Grok reviews of this PR found where the two copies disagreed.
describe("Z3 and the evaluator on the input edge", () => {
  const tiny = (facts: Spec["facts"], rules: [string, Spec["rules"][number]["when"]][], extra: Partial<Spec> = {}): Spec => ({
    domain: "test", version: 1, sop: { file: "", revision: "" }, order: ["decline", "incomplete", "approve"], order_sop: "2.1",
    unknowns: { sop: "2.2", text: "", then: "incomplete" }, facts, collections: [{ key: "people", item: "person" }], computed: [], lists: {},
    rules: rules.map(([id, when]) => ({ id, sop: id, text: "", then: "decline", when })), ...extra,
  });
  const only = (facts: Case["facts"], people: Case["items"]["people"] = []): Case => ({ facts, items: { people }, computed: {} });

  it("a list value the fact can't take never matches unknown", async () => {
    const sp = tiny([{ key: "flag", per: "case", values: ["yes", "no"] }], [["r", { fact: "flag", in: "bad" }]], { lists: { bad: ["yes", "maybe"] } });
    await agree(sp, only({ flag: "unknown" }));
    await agree(sp, only({ flag: "maybe" }));
  });
  it("a declared value spelled \"unknown\" is unknown", async () => {
    await agree(tiny([{ key: "k", per: "case", values: ["p", "n", "unknown"] }], [["r", { fact: "k", is: "p" }]]), only({ k: "unknown" }));
  });
  it("a literal \"other\" is a value of its own", async () => {
    await agree(tiny([{ key: "kind", per: "case", values: ["yes", "other"] }], [["r", { fact: "kind", is: "other" }]]), only({ kind: "maybe" }));
    const open = tiny([{ key: "kind", per: "case", values: [] }], [["r", { fact: "kind", is: "other" }]]);
    await agree(open, only({ kind: "normal" }));
    await agree(open, only({ kind: "other" }));
  });
  it("a value named only in empty_ok_when counts", async () => {
    const sp = tiny([{ key: "country", per: "case", values: [] }, { key: "x", per: "people", values: ["yes", "no"] }],
      [["r", { some: "people", where: { fact: "x", is: "yes" } }]], { collections: [{ key: "people", item: "person", empty_ok_when: { fact: "country", is: "US" } }] });
    await agree(sp, only({ country: "DE" }));
    await agree(sp, only({ country: "US" }));
  });

  const clean: Case = {
    facts: { excluded: "no", nonprofit: "no", industry: "normal", licence_verified: "no", country: "US", entity_sanctions: "none", entity_adverse_media: "no" },
    items: { people: [{ name: "A", residence: "US", id_verified: "yes", sanctions: "none", pep: "no", adverse_media: "no" }] },
    computed: { ownership_complete: "yes", control_person_identified: "yes", registry_age_months: 3 },
  };
  it("an undeclared computed value is unknown, in both", async () => {
    const kase = { ...clean, computed: { ...clean.computed, ownership_complete: "maybe" } };
    expect(evaluate(spec, kase).outcome).toBe("incomplete");
    await agree(spec, kase);
  });
  it("registry age around 12 months, negative, and not a number", async () => {
    for (const age of [11, 11.5, 12, 13, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await agree(spec, { ...clean, computed: { ...clean.computed, registry_age_months: age } });
    }
  });
});

// The Z3 encoding is a second copy of the rules, so it must agree with the evaluator case by case.
describe("Z3 agrees with the evaluator", () => {
  // Mostly clean values, so a single odd fact often decides the case; otherwise most cases are just incomplete.
  const w = <T>(clean: T, ...others: T[]) => fc.oneof({ arbitrary: fc.constant(clean), weight: 3 * others.length }, ...others.map((o) => ({ arbitrary: fc.constant(o), weight: 1 })));
  const tri = (clean: string) => w<string | undefined>(clean, clean === "yes" ? "no" : "yes", "unknown", undefined);
  const screen = w("none", "potential", "confirmed", "unknown", "maybe");  // "maybe" isn't a declared value
  const place = w("US", "DE", "IR", "VE", "unknown");
  const person = (name: string) => fc.record({ name: fc.constant(name), residence: place, id_verified: tri("yes"), sanctions: screen, pep: w<string | undefined>("no", "yes", "unknown", undefined, "maybe"), adverse_media: tri("no") });
  const arb = fc.record({
    entity: fc.record({ country: place, excluded: w<boolean | string | undefined>(false, true, "unknown", undefined), nonprofit: w<boolean | string | undefined>(false, true, "unknown"),
                        industry: w("normal", "msb", "crypto", "prohibited", "unknown"), licence_verified: w<boolean | string>(false, true, "unknown"),
                        // 5, 13 and exactly 12 months before the review, a filing after it, and none.
                        registry_filed: w<string | null>("2026-06-01", "2025-09-01", "2025-10-27", "2026-11-27", null), screening: fc.record({ sanctions: screen, adverse_media: tri("no") }) }),
    ownership: w<{ name: string; type: "person"; pct: number }[] | null>([{ name: "A", type: "person", pct: 80 }], [{ name: "A", type: "person", pct: 50 }], null),
    control_person: w<{ name: string } | null | undefined>({ name: "A" }, null, undefined),
    people: fc.oneof(fc.constant([]), fc.tuple(person("A")), fc.tuple(person("A"), person("B")), fc.tuple(person("A"), person("B"), person("C"))),
  });

  it("on 500 random cases and the six examples", async () => {
    const ctx = await z3Context();
    const enc = new Encoder(ctx, spec, 3);
    const check = (c: KybFacts) => agree(spec, toCase(c).case, 3);
    for (const ex of loadExamples()) await check(ex.facts);
    const samples = fc.sample(arb, { numRuns: 500, seed: 7 });
    for (const x of samples) await check({ review_date: "2026-10-27", ...x } as KybFacts);
  }, 60000);
});
