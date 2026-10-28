import { afterAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { evaluate } from "../../core/evaluate.ts";
import { checkSop, diffSpecs } from "../../core/sop-checks.ts";
import type { Spec } from "../../core/spec.ts";
import { Encoder, shutdown, z3Context } from "../../core/z3.ts";
import { kybSpec, loadExamples } from "./examples.ts";
import { type KybFacts, toCase } from "./facts.ts";
import type { Holder } from "./ownership.ts";

const spec = kybSpec();
afterAll(shutdown);

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
  }, 30000);

  it("finds nothing once 3.4 follows 2.2 and 5.3 is removed", async () => {
    const fixed: Spec = structuredClone(spec);
    fixed.rules = fixed.rules.filter((r) => r.id !== "msb-licensed");
    fixed.rules.find((r) => r.id === "id-verified")!.when = { some: "people", where: { fact: "id_verified", is: "no" } };
    fixed.facts = fixed.facts.filter((f) => f.key !== "licence_verified");
    expect(await checkSop(fixed)).toEqual([]);
  }, 30000);

  it("shows what changes between two versions", async () => {
    const v2: Spec = structuredClone(spec);
    v2.version = 2;
    v2.rules.find((r) => r.id === "id-verified")!.when = { some: "people", where: { fact: "id_verified", is: "no" } };
    const changes = await diffSpecs(spec, v2);
    expect(changes.map((c) => `${c.from} -> ${c.to}`)).toEqual(["request_docs -> incomplete"]);
  }, 30000);

  it("shows what changes when the spec's 3.3 bar for who must be identified moves", async () => {
    const v2: Spec = structuredClone(spec);
    v2.version = 2;
    (v2.collections[0].counts_when as { any: { sum?: unknown; at_least?: number }[] }).any.find((x) => x.sum)!.at_least = 50;
    const changes = await diffSpecs(spec, v2);
    // An owner at 25-49% the agent left out no longer holds the case up, whatever their screening says.
    expect(changes.map((c) => `${c.from} -> ${c.to}`)).toContain("incomplete -> approve");
    const ex = changes.find((c) => c.from === "incomplete" && c.to === "approve")!.example;
    expect(ex.items.people.some((p) => p.listed === "no" && Number(p.share_pct) < 50)).toBe(true);
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
                        registry_filed: w<string | null>("2026-06-01", "2025-09-01", null), screening: fc.record({ sanctions: screen, adverse_media: tri("no") }) }),
    // Shares that land on or near 3.3's 25%, excluded entities either side of it, a company with unknown owners,
    // and a table over 100%, so who counts and when ownership is complete are compared too.
    ownership: w<Holder[] | null>([{ name: "A", type: "person", pct: 80 }], [{ name: "A", type: "person", pct: 50 }], null,
      [{ name: "A", type: "person", pct: 75 }, { name: "B", type: "person", pct: "24.01" }, { name: null, type: "unknown", pct: "0.99" }],
      [{ name: "A", type: "person", pct: 75 }, { name: "B", type: "person", pct: "24.99" }],
      [{ name: "A", type: "person", pct: 60 }, { name: "Bank", type: "excluded_entity", pct: 20 }, { name: "Fund", type: "excluded_entity", pct: 20 }],
      [{ name: "A", type: "person", pct: 75 }, { name: "Bank", type: "excluded_entity", pct: 25 }],
      [{ name: "A", type: "person", pct: 50 }, { name: "H", type: "entity", pct: 50, owners: null }],
      [{ name: "A", type: "person", pct: 60 }, { name: "B", type: "person", pct: 60 }]),
    control_person: w<{ name: string } | null | undefined>({ name: "A" }, null, undefined),
    people: fc.oneof(fc.constant([]), fc.tuple(person("A")), fc.tuple(person("A"), person("B")), fc.tuple(person("A"), person("B"), person("C"))),
  });

  it("on 500 random cases and the six examples", async () => {
    const ctx = await z3Context();
    const enc = new Encoder(ctx, spec, 3);
    const s = enc.symCase("agree");
    const { outcome } = enc.run(s);
    const check = async (c: KybFacts) => {
      const kase = toCase(c).case;
      const r = evaluate(spec, kase);
      const solver = new ctx.Solver();
      for (const d of [...s.domain, ...enc.pin(s, kase)]) solver.add(d);
      expect(await solver.check()).toBe("sat");
      expect(spec.order[Number(solver.model().eval(outcome).toString())]).toBe(r.outcome);
    };
    for (const ex of loadExamples()) await check(ex.facts);
    const samples = fc.sample(arb, { numRuns: 500, seed: 7 });
    for (const x of samples) await check({ review_date: "2026-10-27", ...x } as KybFacts);
  }, 60000);
});
