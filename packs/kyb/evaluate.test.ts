import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { validateSpec } from "../../core/spec.ts";
import { kybSpec } from "./examples.ts";
import { type KybFacts as CaseFacts, evaluateKyb as evaluate } from "./facts.ts";

const spec = kybSpec();
const person = (name: string, extra: object = {}) => ({ name, residence: "US", id_verified: "yes", sanctions: "none", pep: "no", adverse_media: "no", ...extra });
const clean = (over: Partial<CaseFacts> = {}): CaseFacts => ({
  review_date: "2026-10-27",
  entity: { country: "US", excluded: false, nonprofit: false, industry: "normal", licence_verified: false, registry_filed: "2026-03-02",
            screening: { sanctions: "none", adverse_media: "no" } },
  ownership: [{ name: "Ana", type: "person", pct: 60 }, { name: "Ben", type: "person", pct: 40 }],
  control_person: { name: "Ana" },
  people: [person("Ana"), person("Ben")],
  ...over,
});

describe("the reference spec", () => {
  it("is well formed", () => expect(validateSpec(spec)).toEqual([]));
  it("rejects a rule an unknown fact could switch off", () => {
    const bad = structuredClone(spec);
    bad.rules[0].when = { all: [{ not: { fact: "excluded", is_unknown: true } }, { fact: "excluded", is: "no" }] };
    expect(validateSpec(bad)).toEqual(["Rule control-person applies only once excluded is known, so an unknown excluded hides it."]);
  });
  it("rejects a rule comparing a computed fact with a value it can't take", () => {
    const bad = structuredClone(spec);
    bad.rules[0].when = { computed: "control_person_identified", is: "No" };
    expect(validateSpec(bad)).toEqual([`Rule control-person compares control_person_identified with "No", which isn't one of its values.`]);
  });
});

describe("evaluate", () => {
  it("approves a clean case", () => expect(evaluate(spec, clean()).outcome).toBe("approve"));

  it("never reads an unknown as a no (2.2)", () => {
    const c = clean({ people: [person("Ana", { pep: "unknown" }), person("Ben")] });
    const r = evaluate(spec, c);
    expect(r.outcome).toBe("incomplete");
    expect(r.decided_by[0]).toMatchObject({ rule: "pep", because: ["pep for Ana"] });
  });

  it("treats a missing fact as unknown", () => {
    const c = clean();
    delete (c.entity as Record<string, unknown>).industry;
    expect(evaluate(spec, c).outcome).toBe("incomplete");
  });

  it("treats an empty list of individuals as unknown, unless the entity is excluded", () => {
    expect(evaluate(spec, clean({ people: [], ownership: null, control_person: undefined })).outcome).toBe("incomplete");
    const excluded = clean({ people: [], ownership: null, control_person: null });
    excluded.entity.excluded = true;
    expect(evaluate(spec, excluded).outcome).toBe("approve");
  });

  it("screens every owner of 25% or more and the control person, even if the people list leaves them out", () => {
    const r = evaluate(spec, clean({ people: [person("Ana")], control_person: { name: "Cy" } }));
    expect(r.decided_by.map((h) => h.rule)).toEqual(["id-verified"]);   // Ben and Cy's ID checks are pending (3.4 as written)
    expect(r.might_apply.find((h) => h.rule === "pep")?.because).toEqual(["pep for Ben", "pep for Cy"]);
  });

  it("declines a confirmed sanctions match and escalates a potential one, on the entity or a person (4.1, 4.2)", () => {
    const entity = (s: string) => { const c = clean(); c.entity.screening!.sanctions = s; return evaluate(spec, c).decided_by[0]?.rule; };
    const someone = (s: string) => evaluate(spec, clean({ people: [person("Ana"), person("Ben", { sanctions: s })] })).decided_by[0]?.rule;
    expect([entity("confirmed"), entity("potential")]).toEqual(["sanctions-confirmed", "sanctions-potential"]);
    expect([someone("confirmed"), someone("potential")]).toEqual(["sanctions-confirmed", "sanctions-potential"]);
    expect(evaluate(spec, clean({ people: [person("Ana"), person("Ben", { sanctions: "confirmed" })] })).outcome).toBe("decline");
  });

  it("screens a named owner who could reach 25% with the unaccounted shares", () => {
    // Ben holds 24.01% and 0.99% is unaccounted: if that 0.99% is also Ben's, he owns 25%.
    const c = clean({ people: [person("Ana")], ownership: [
      { name: "Ana", type: "person", pct: 75 }, { name: "Ben", type: "person", pct: "24.01" }, { name: null, type: "unknown", pct: "0.99" }] });
    expect(evaluate(spec, c).decided_by.map((h) => h.rule)).toEqual(["id-verified"]);
  });

  it("asks for documents when the cap table lists over 100% (policy owner, 2026-10-28)", () => {
    const c = clean({ ownership: [{ name: "Ana", type: "person", pct: 60 }, { name: "Ben", type: "person", pct: 60 }] });
    expect(evaluate(spec, c)).toMatchObject({ outcome: "request_docs", decided_by: [{ rule: "ownership-complete" }] });
  });

  it("reads a country written as a name, not a code, as unknown", () => {
    const c = clean(); c.entity.country = "Iran";
    const r = evaluate(spec, c);
    expect([r.outcome, ...r.decided_by.map((h) => h.rule)]).toEqual(["incomplete", "country-sanctioned", "country-high-risk"]);
  });

  it("reads a country code in any case", () => {
    const c = clean(); c.people![1].residence = " ir ";
    expect(evaluate(spec, c)).toMatchObject({ outcome: "decline", decided_by: [{ rule: "country-sanctioned" }] });
  });

  it("escalates every FATF jurisdiction of 19 June 2026, not only the ones in the examples (6.2)", () => {
    for (const code of spec.lists.high_risk_jurisdictions.filter((x) => !spec.lists.sanctioned_countries.includes(x))) {
      const c = clean(); c.entity.country = code;
      expect([code, evaluate(spec, c).outcome]).toEqual([code, "escalate"]);
    }
    // Written by hand from FATF's statements, so a list that loses a country fails here.
    expect(spec.lists.high_risk_jurisdictions).toEqual(expect.arrayContaining(["BG", "KE", "IQ", "BA", "MC", "VN", "MM", "KP", "IR"]));
  });

  it("reads the SOP's own words for an industry (5.1, 5.2)", () => {
    const at = (industry: string) => { const c = clean(); c.entity.industry = industry; return evaluate(spec, c).decided_by[0]?.rule; };
    expect(["Marijuana-related business", "adult content", "unlicensed money transmission"].map(at)).toEqual(Array(3).fill("industry-prohibited"));
    expect(["money services business", "Virtual currency"].map(at)).toEqual(Array(2).fill("industry-restricted"));
  });

  it("treats a value the spec doesn't know as unknown, not as a no", () => {
    const r = evaluate(spec, clean({ people: [person("Ana", { pep: "maybe" }), person("Ben")] }));
    expect(r).toMatchObject({ outcome: "incomplete", decided_by: [{ rule: "pep", because: [`pep for Ana (unrecognised value "maybe")`] }] });
  });

  it("treats a registry date it can't read as unknown, not fresh", () => {
    const c = clean(); c.entity.registry_filed = "03/2026?";
    expect(evaluate(spec, c)).toMatchObject({ outcome: "incomplete", decided_by: [{ rule: "registry-fresh" }] });
  });

  it("does not need ownership for a nonprofit, but does need a control person", () => {
    const np = clean({ ownership: null, control_person: null });
    np.entity.nonprofit = true;
    expect(evaluate(spec, np)).toMatchObject({ outcome: "request_docs", decided_by: [{ rule: "control-person" }] });
  });

  it("picks the most severe outcome (2.1)", () => {
    const c = clean({ people: [person("Ana", { pep: "yes", residence: "IR" }), person("Ben")] });
    expect(evaluate(spec, c)).toMatchObject({ outcome: "decline", decided_by: [{ rule: "country-sanctioned" }] });
  });

  it("escalates a PEP while a sanctions check is pending, with a note (policy owner, 2026-10-27)", () => {
    const r = evaluate(spec, clean({ people: [person("Ana", { pep: "yes" }), person("Ben", { sanctions: "unknown" })] }));
    expect(r.outcome).toBe("escalate");
    expect(r.notes).toEqual(["4.1 could still apply once sanctions for Ben is known, and would mean decline."]);
  });

  it("follows 3.4 as written: a pending ID check asks for documents (the planted clash with 2.2)", () => {
    const r = evaluate(spec, clean({ people: [person("Ana"), person("Ben", { id_verified: "unknown" })] }));
    expect(r).toMatchObject({ outcome: "request_docs", decided_by: [{ rule: "id-verified" }] });
  });

  it("never decides by 5.3: a licensed MSB still escalates under 5.2", () => {
    const c = clean();
    c.entity.industry = "msb"; c.entity.licence_verified = true;
    const r = evaluate(spec, c);
    expect(r.applied.map((h) => h.rule)).toContain("msb-licensed");
    expect(r.outcome).toBe("escalate");
  });

  it("counts the registry filing's age from the review date (3.5)", () => {
    const at = (filed: string) => { const c = clean(); c.entity.registry_filed = filed; return evaluate(spec, c).outcome; };
    expect(at("2025-10-28")).toBe("approve");      // 11 months
    expect(at("2025-10-27")).toBe("request_docs"); // 12 months to the day
  });

  it("never approves when a different value of an unknown fact would change the outcome", () => {
    // Mostly the clean value, so a good share of cases approve and the property has something to check.
    const mostly = (clean: string, ...others: string[]) =>
      fc.oneof({ arbitrary: fc.constant(clean), weight: 3 }, { arbitrary: fc.constantFrom(...others), weight: 1 });
    const arb = fc.record({ pep: mostly("no", "yes", "unknown"), adverse: mostly("no", "yes", "unknown"), id: mostly("yes", "no", "unknown"),
                            sanctions: mostly("none", "potential", "confirmed", "unknown"), industry: mostly("normal", "msb", "prohibited", "unknown"),
                            residence: mostly("US", "IR", "VE", "unknown") });
    const build = (x: { pep: string; adverse: string; id: string; sanctions: string; industry: string; residence: string }) => {
      const c = clean({ people: [person("Ana", { pep: x.pep, adverse_media: x.adverse, id_verified: x.id, sanctions: x.sanctions, residence: x.residence }), person("Ben")] });
      c.entity.industry = x.industry;
      return c;
    };
    let approved = 0;
    fc.assert(fc.property(arb, (x) => {
      if (evaluate(spec, build(x)).outcome !== "approve") return true;
      approved++;
      // An approve is only allowed if every way of filling in all the unknowns together also approves.
      const fills: Record<keyof typeof x, string[]> = { pep: ["yes", "no"], adverse: ["yes", "no"], id: ["yes", "no"],
        sanctions: ["none", "potential", "confirmed"], industry: ["normal", "msb", "prohibited"], residence: ["US", "IR", "VE"] };
      let completions = [x];
      for (const k of Object.keys(fills) as (keyof typeof x)[]) {
        if (x[k] === "unknown") completions = completions.flatMap((c) => fills[k].map((v) => ({ ...c, [k]: v })));
      }
      return completions.every((c) => evaluate(spec, build(c)).outcome === "approve");
    }), { numRuns: 2000 });
    expect(approved).toBeGreaterThan(0); // otherwise the property checks nothing
  });
});
