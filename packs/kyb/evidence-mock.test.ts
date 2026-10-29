import { describe, expect, it } from "vitest";
import { kybSpec, loadExamples } from "./examples.ts";
import { evaluateKyb } from "./facts.ts";
import { KybEvidence } from "./evidence-mock.ts";

describe("the mocked evidence system", () => {
  const spec = kybSpec();
  const examples = loadExamples();
  const ex = (id: string) => examples.find((e) => e.case_id === id)!;

  // Asking for everything gives Resolve the same case as the raw facts, so the mock adds and loses nothing.
  for (const e of examples) {
    it(`${e.case_id}: everything asked gives the raw facts' outcome`, () => {
      const ev = new KybEvidence(e.case_id, e.facts);
      ev.all();
      const r = evaluateKyb(spec, ev.caseFile(e.facts.review_date));
      const truth = evaluateKyb(spec, e.facts);
      expect([r.outcome, r.decided_by.map((h) => h.rule)]).toEqual([truth.outcome, truth.decided_by.map((h) => h.rule)]);
      expect(r.notes).toEqual(truth.notes);
    });
  }

  it("answers only what's asked, and Resolve reads the rest as unknown", () => {
    const ev = new KybEvidence("EX-5", ex("EX-5").facts);
    ev.get(["entity.country", "ownership"]);
    const r = evaluateKyb(spec, ev.caseFile("2026-10-27"));
    expect(r.outcome).toBe("incomplete");
    // Dariush Karimi's residence was never asked, so Tehran can't decide yet; 6.1 might still apply.
    expect(r.might_apply.map((h) => h.sop)).toContain("6.1");
  });

  it("lists a company's owners only when they're asked for", () => {
    const ev = new KybEvidence("EX-1", ex("EX-1").facts);
    const [own] = ev.get(["ownership"]);
    expect(own.value).toEqual([
      { name: "Dana Ruiz", type: "person", pct: 35 },
      { name: "Halcyon Holdings LLC", type: "entity", pct: 40 },
      { name: "Wei Lee", type: "person", pct: 25 },
    ]);
    expect(ev.caseFile("2026-10-27").ownership![1].owners).toBeNull();
    const [halcyon] = ev.get(["ownership_of:Halcyon Holdings LLC"]);
    expect(halcyon.value).toEqual([{ name: "Priya Shah", type: "person", pct: 100 }]);
    expect(ev.caseFile("2026-10-27").ownership![1].owners).toEqual([{ name: "Priya Shah", type: "person", pct: 100 }]);
  });

  it("says unknown for a pending check and for a request it doesn't know", () => {
    const ev = new KybEvidence("EX-6", ex("EX-6").facts);
    const [pending, bogus, nobody] = ev.get(["person:Thomas Finch.sanctions", "entity.revenue", "ownership_of:Nobody Ltd"]);
    expect(pending.value).toBe("unknown");
    expect(bogus.value).toMatch(/not a request/);
    expect(nobody.value).toMatch(/no company named/);
  });

  it("reads a request with stray spaces as the same request, so the case file finds the same people", () => {
    const tidy = new KybEvidence("EX-1", ex("EX-1").facts), loose = new KybEvidence("EX-1", ex("EX-1").facts);
    const reqs = (names: string[]) => [...["country", "excluded", "nonprofit", "industry", "registry_filed", "sanctions", "adverse_media"].map((f) => `entity.${f}`),
      "ownership", "control_person", "certification", ...names.flatMap((n) => ["residence", "id_verified", "sanctions", "pep", "adverse_media"].map((f) => `person:${n}.${f}`))];
    tidy.get([...reqs(["Dana Ruiz", "Wei Lee", "Priya Shah"]), "ownership_of:Halcyon Holdings LLC"]);
    loose.get([...reqs([" Dana Ruiz", "Wei Lee ", "  Priya Shah"]), "ownership_of:  Halcyon Holdings LLC "]);
    expect(loose.log.map((a) => a.request)).toEqual(tidy.log.map((a) => a.request));
    const outcome = (e: KybEvidence) => evaluateKyb(spec, e.caseFile("2026-10-27")).outcome;
    expect(outcome(loose)).toBe("escalate");
    expect(outcome(loose)).toBe(outcome(tidy));
  });
});
