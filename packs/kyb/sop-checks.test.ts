import { afterAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import { type Case, evaluate } from "../../core/evaluate.ts";
import { checkSop, diffSpecs, factsOf, sopCoverage } from "../../core/sop-checks.ts";
import type { Spec } from "../../core/spec.ts";
import { Encoder, shutdown, z3Context } from "../../core/z3.ts";
import { kybSpec, shareBar, loadExamples } from "./examples.ts";
import { type KybFacts, toCase } from "./facts.ts";
import type { Holder } from "./ownership.ts";

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
  }, 120_000); // Z3 on the full KYB spec; slow when other test files share the cores

  it("finds nothing once 3.4 follows 2.2 and 5.3 is removed", async () => {
    const fixed: Spec = structuredClone(spec);
    fixed.rules = fixed.rules.filter((r) => r.id !== "msb-licensed");
    fixed.rules.find((r) => r.id === "id-verified")!.when = { some: "people", where: { fact: "id_verified", is: "no" } };
    fixed.facts = fixed.facts.filter((f) => f.key !== "licence_verified");
    expect(await checkSop(fixed)).toEqual([]);
  }, 120_000);

  it("looks at as many people as a rule needs", async () => {
    // Three different people must each be screened as something different: two slots would call this dead.
    const v: Spec = structuredClone(spec);
    v.rules.push({ id: "three", sop: "9.7", text: "", then: "decline", when: { all: (["none", "potential", "confirmed"] as const).map((x) =>
      ({ some: "people", where: { fact: "sanctions", is: x } })) } });
    expect((await checkSop(v)).map((f) => f.id)).not.toContain("dead-three");
  }, 60000);

  it("says how many people each check covered", () => {
    // Who counts ties KYB's ten rules about people into one group. The unknowns check would need 10 people, so
    // it looks at 6. KYB adds up owners' shares, and no number of people covers every case of a sum, so the other
    // two say how many they looked at too (found in the PR #18 review).
    expect(sopCoverage(spec)).toEqual([{ check: "dead", upTo: 9 }, { check: "unknowns", upTo: 6 }, { check: "unused", upTo: 9 }]);
    expect(sopCoverage(spec, { slots: 2 }).map((c) => c.upTo)).toEqual([2, 2, 2]);
  });

  it("says a rule whose conditions can't all hold never applies, and blames no other rule", async () => {
    const v: Spec = structuredClone(spec);
    v.rules.push({ id: "impossible", sop: "9.9", text: "", then: "approve", when: { all: [{ fact: "excluded", is: "yes" }, { fact: "excluded", is: "no" }] } });
    const f = (await checkSop(v)).find((x) => x.id === "dead-impossible")!;
    expect(f.rule_ids).toEqual(["impossible"]);
    expect(f.title).toBe("9.9 can never apply");
  }, 120_000);

  it("reports an unknowns finding only where the rule decides the case", async () => {
    // A rule that declines every case, so 3.4 never decides one.
    const v: Spec = structuredClone(spec);
    v.rules.push({ id: "always", sop: "9.8", text: "", then: "decline",
                   when: { any: [{ fact: "excluded", is: "yes" }, { fact: "excluded", is: "no" }, { fact: "excluded", is_unknown: true }] } });
    expect((await checkSop(v)).filter((f) => f.kind === "unknowns")).toEqual([]);
  }, 120_000);

  it("compares versions whose lists differ", async () => {
    const v2: Spec = structuredClone(spec);
    v2.version = 2;
    v2.lists.sanctioned_countries = [...v2.lists.sanctioned_countries, "XX"];
    const changes = await diffSpecs(spec, v2);
    // Someone in XX now declines the case; someone in XX who might be an identified individual makes it incomplete.
    expect(changes.map((c) => `${c.from} -> ${c.to}`).sort()).toEqual(
      ["approve -> decline", "approve -> incomplete", "escalate -> decline", "incomplete -> decline", "request_docs -> decline"]);
  }, 120_000);

  it("shows what changes between two versions", async () => {
    const v2: Spec = structuredClone(spec);
    v2.version = 2;
    v2.rules.find((r) => r.id === "id-verified")!.when = { some: "people", where: { fact: "id_verified", is: "no" } };
    const changes = await diffSpecs(spec, v2);
    expect(changes.map((c) => `${c.from} -> ${c.to}`)).toEqual(["request_docs -> incomplete"]);
  }, 120_000);

  it("shows what changes when the spec's 3.3 bar for who must be identified moves", async () => {
    const v2: Spec = structuredClone(spec);
    v2.version = 2;
    shareBar(v2).at_least = 50;
    const changes = await diffSpecs(spec, v2);
    // An owner at 25-49% no longer holds the case up. Z3 may pick a person the agent left out, one it listed but
    // couldn't screen, or an owner the SOP excludes, so the example is only held to a share the move covers.
    expect(changes.map((c) => `${c.from} -> ${c.to}`)).toContain("incomplete -> approve");
    const ex = changes.find((c) => c.from === "incomplete" && c.to === "approve")!.example;
    const shares = [...ex.items.people!.map((p) => p.share_pct), ...(ex.items.excluded_owners ?? []).map((o) => o.excluded_share_pct)].map(Number);
    expect(shares.some((x) => x >= 25 && x < 50)).toBe(true);
  }, 120_000);

  it("compares two versions whatever order their facts are declared in", async () => {
    const v2: Spec = structuredClone(spec);
    v2.facts.reverse();
    expect(await diffSpecs(spec, v2)).toEqual([]);
  }, 120_000);

  it("refuses two versions where one computes a fact in the spec and the other takes it from the pack", async () => {
    const v2: Spec = structuredClone(spec);
    const sum = v2.computed.find((c) => c.key === "unidentified_pct")!;
    delete sum.sum;
    await expect(diffSpecs(spec, v2)).rejects.toThrow("different facts");
    await expect(diffSpecs(v2, spec)).rejects.toThrow("different facts");
  }, 120_000);

  it("refuses, in a plain sentence, two versions with different numeric facts, or a broken spec", async () => {
    const v2: Spec = structuredClone(spec);
    v2.computed = v2.computed.filter((c) => c.key !== "registry_age_months");
    v2.rules = v2.rules.filter((r) => !JSON.stringify(r.when).includes("registry_age_months"));
    await expect(diffSpecs(spec, v2)).rejects.toThrow("different facts");
    const broken: Spec = structuredClone(spec);
    broken.rules[0].when = { fact: "no_such_fact", is: "yes" };
    await expect(checkSop(broken)).rejects.toThrow("fix them before running Z3");
  }, 120_000);
});

// Inputs the Codex and Grok reviews of this PR found where the two copies disagreed.
describe("Z3 and the evaluator on the input edge", () => {
  const tiny = (facts: Spec["facts"], rules: [string, Spec["rules"][number]["when"]][], extra: Partial<Spec> = {}): Spec => ({
    domain: "test", version: 1, sop: { file: "", revision: "" }, order: ["decline", "incomplete", "approve"], order_sop: "2.1",
    unknowns: { sop: "2.2", text: "", then: "incomplete" }, facts, collections: [{ key: "people", item: "person" }], computed: [], lists: {},
    rules: rules.map(([id, when]) => ({ id, sop: id, text: "", then: "decline", when })), ...extra,
  });
  const only = (facts: Case["facts"], people: Case["items"]["people"] = []): Case => ({ facts, items: { people }, computed: {} });

  it("a numeric case fact comes back from Z3 as a fact, so its example replays", async () => {
    const at = (bar: number) => tiny([{ key: "amount", per: "case", numeric: true }], [["r", { fact: "amount", at_least: bar }]], { collections: [] });
    const changes = await diffSpecs(at(25), { ...at(1 / 3), version: 2 });
    expect(changes.map((c) => `${c.from} -> ${c.to}`)).toEqual(["approve -> decline"]);
    expect(typeof changes[0].example.facts.amount).not.toBe("undefined");
  });
  it("a word map change is refused, not reported as no change", async () => {
    const v2: Spec = structuredClone(spec);
    v2.maps!.industry["virtual currency"] = "normal";
    await expect(diffSpecs(spec, v2)).rejects.toThrow("word maps differ");
  });
  it("a rule's facts include who counts in its lists and what its sums add up", () => {
    const keys = factsOf(spec, ["ownership-complete", "pep"]);
    for (const k of ["unaccounted_pct", "excluded_share_pct", "listed", "control_person", "share_pct", "certified_pct", "excluded", "nonprofit"]) expect(keys).toContain(k);
  });
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
    items: { people: [{ name: "A", listed: "yes", control_person: "yes", share_pct: 100, certified_pct: 0,
                        residence: "US", id_verified: "yes", sanctions: "none", pep: "no", adverse_media: "no" }], excluded_owners: [] },
    computed: { over_allocated: "no", unaccounted_pct: 0, control_person_identified: "yes", registry_age_months: 3 },
  };
  it("an undeclared computed value is unknown, in both", async () => {
    expect(evaluate(spec, clean).outcome).toBe("approve");
    const kase = { ...clean, computed: { ...clean.computed, over_allocated: "maybe" } };
    expect(evaluate(spec, kase).outcome).toBe("incomplete");
    await agree(spec, kase);
  });
  it("a share no decimal holds, like 1/3, lands on 25% exactly, in both", async () => {
    // Z3 can pick 1/3 + 74/3 = 25; read as floats, the evaluator would land just under or over.
    const owner = { name: "B", listed: "no", control_person: "no", share_pct: "1/3", certified_pct: 0 };
    const kase = { ...clean, items: { ...clean.items, people: [...clean.items.people!, owner] }, computed: { ...clean.computed, unaccounted_pct: "74/3" } };
    expect(evaluate(spec, kase).counts.people).toEqual({ A: "yes", B: "yes" });
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
    // None on file (someone it might name stands in, so up to four people), one certifying nobody, A, or someone new.
    certification: w<KybFacts["certification"]>([{ name: "A", pct: 80 }], undefined, [], [{ name: "C", pct: 30 }]),
  });

  it("on 500 random cases and the six examples", async () => {
    const ctx = await z3Context();
    const enc = new Encoder(ctx, spec, 4);
    const check = (c: KybFacts) => agree(spec, toCase(c).case, 4);
    for (const ex of loadExamples()) await check(ex.facts);
    const samples = fc.sample(arb, { numRuns: 500, seed: 7 });
    for (const x of samples) await check({ review_date: "2026-10-27", ...x } as KybFacts);
  }, 60000);
});
