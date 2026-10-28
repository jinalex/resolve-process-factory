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

  it("escalates a PEP while a sanctions check is pending, with a note (Alex, 2026-10-27)", () => {
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
    const tri = fc.constantFrom("yes", "no", "unknown");
    const screen = fc.constantFrom("none", "potential", "confirmed", "unknown");
    const arb = fc.record({ pep: tri, adverse: tri, id: tri, sanctions: screen, industry: fc.constantFrom("normal", "msb", "prohibited", "unknown"),
                            residence: fc.constantFrom("US", "IR", "VE", "unknown") });
    const build = (x: { pep: string; adverse: string; id: string; sanctions: string; industry: string; residence: string }) => {
      const c = clean({ people: [person("Ana", { pep: x.pep, adverse_media: x.adverse, id_verified: x.id, sanctions: x.sanctions, residence: x.residence })] });
      c.entity.industry = x.industry;
      return c;
    };
    fc.assert(fc.property(arb, (x) => {
      if (evaluate(spec, build(x)).outcome !== "approve") return true;
      // An approve is only allowed if every way of filling in the unknowns also approves.
      const fills = { pep: ["yes", "no"], adverse: ["yes", "no"], id: ["yes", "no"], sanctions: ["none", "potential", "confirmed"],
                      industry: ["normal", "msb", "prohibited"], residence: ["US", "IR", "VE"] } as const;
      return (Object.keys(fills) as (keyof typeof fills)[]).every((k) => x[k] !== "unknown" ||
        fills[k].every((v) => evaluate(spec, build({ ...x, [k]: v })).outcome === "approve"));
    }), { numRuns: 2000 });
  });
});
