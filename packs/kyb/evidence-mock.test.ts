import { describe, expect, it } from "vitest";
import { kybSpec, loadExamples } from "./examples.ts";
import { evaluateIdentified as evaluateKyb } from "./facts.ts";
import { KybEvidence, KybWorld } from "./evidence-mock.ts";
import type { KybFacts } from "./facts.ts";
import { generateCases } from "../../bench/cases.ts";

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

  // Found in the adversarial review (Grok): a certification nobody read was read as "certifies nobody".
  it("reads a certification nobody asked for as unknown, so Resolve can't approve past it", () => {
    const facts: KybFacts = {
      review_date: "2026-10-27",
      entity: { country: "US", excluded: "no", nonprofit: "no", industry: "normal", licence_verified: "no", registry_filed: "2026-10-01",
                screening: { sanctions: "none", adverse_media: "no" } },
      ownership: [{ name: "Ana Abara", type: "person", pct: 100 }],
      control_person: { name: "Ana Abara", basis: "CEO" },
      people: [{ name: "Ana Abara", residence: "US", id_verified: "yes", sanctions: "none", pep: "no", adverse_media: "no" }],
      certification: [{ name: "Bob Brandt", pct: 40 }],
    };
    expect(evaluateKyb(spec, facts).outcome).toBe("request_docs"); // Bob is certified at 40% and never verified
    const w = new KybWorld("X", facts, spec);
    w.get(["entity.country", "entity.excluded", "entity.nonprofit", "entity.industry", "entity.licence_verified", "entity.registry_filed",
      "entity.sanctions", "entity.adverse_media", "ownership", "control_person", ...["residence", "nationality", "id_verified", "sanctions", "pep", "adverse_media"].map((f) => `person:Ana Abara.${f}`)]);
    expect(w.check().outcome).toBe("incomplete");
    expect(w.check().still_needed.join(" ")).toMatch(/certification/);
    w.get(["certification"]);
    expect(w.check().outcome).toBe("request_docs");
  });

  // Found in the adversarial review (Gemini, Grok): asking about someone made them an identified individual.
  it("decides who counts by the spec, not by who was asked about, on every generated case", () => {
    for (const c of generateCases(60)) {
      const w = new KybWorld(c.case_id, c.facts, spec);
      w.all();
      const r = w.check(), key = evaluateKyb(spec, c.facts);
      expect([c.case_id, r.outcome, r.decided_by.map((h) => h.rule)]).toEqual([c.case_id, key.outcome, key.decided_by.map((h) => h.rule)]);
    }
    const b016 = generateCases(16)[15];
    expect(evaluateKyb(spec, b016.facts).decided_by.map((h) => h.sop)).toEqual(["5.2"]); // the 22% owner's adverse media isn't 3.3's to ask about
  });

  it("ignores a question about someone the case doesn't have", () => {
    const e = ex("EX-3"), w = new KybWorld("EX-3", e.facts, spec);
    w.all();
    const before = w.check();
    w.get(["person:Helen Choe.id_verified"]);
    expect(w.check()).toEqual(before);
  });

  it("finds a person whose name has a full stop in it", () => {
    const facts = { ...ex("EX-1").facts, people: [{ name: "J. Weber", pep: "yes" }] };
    expect(new KybEvidence("X", facts).get(["person:J. Weber.pep"])[0].value).toBe("yes");
  });

  // Found in the adversarial review (Codex): a company inside its own chain recursed forever, and two companies
  // with one name answered for each other.
  it("rebuilds an ownership loop without recursing forever, and refuses two companies with one name", () => {
    const base = ex("EX-1").facts;
    const loop: KybFacts = { ...base, ownership: [{ name: "Holdco", type: "entity", pct: 100, owners: [{ name: "Holdco", type: "entity", pct: 100, owners: null }] }] };
    const w = new KybWorld("X", loop, spec);
    w.all();
    expect(w.check().outcome).toBe(evaluateKyb(spec, loop).outcome);
    const twins: KybFacts = { ...base, ownership: [
      { name: "Holdco", type: "entity", pct: 40, owners: [{ name: "Dana Ruiz", type: "person", pct: 100 }] },
      { name: "Holdco", type: "entity", pct: 60, owners: null }] };
    expect(() => new KybEvidence("X", twins)).toThrow(/two companies named "Holdco"/);
    expect(() => new KybEvidence("X", { ...base, people: [{ name: "Dana Ruiz" }, { name: "Dana Ruiz" }] })).toThrow(/two people named "Dana Ruiz"/);
  });
});
