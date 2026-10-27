import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type CaseFile, Documents, checkCase } from "./case-file.ts";
import { ROOT } from "../../core/load.ts";
import { kybSpec } from "./examples.ts";

// Hand-made case files for the six examples, written as a careful analyst would: every fact cited.
const spec = kybSpec();
const load = (id: string) => JSON.parse(readFileSync(join(ROOT, "packs/kyb/fixtures/case-files", `${id}.json`), "utf8")) as CaseFile & { dir: string };
const run = (f: CaseFile & { dir: string }) => checkCase(spec, f, new Documents(join(ROOT, "cases/examples", f.dir)));
const IDS = ["EX-1", "EX-2", "EX-3", "EX-4", "EX-5", "EX-6"];

describe("honest case files", () => {
  const expected: Record<string, { outcome: string; flags: number; missing: number }> = {
    "EX-1": { outcome: "escalate", flags: 2, missing: 0 },     // certification lists a company in Section I, and leaves out Priya Shah
    "EX-2": { outcome: "request_docs", flags: 0, missing: 1 }, // the 30% Class B holders
    "EX-3": { outcome: "escalate", flags: 0, missing: 0 },
    "EX-4": { outcome: "request_docs", flags: 0, missing: 1 }, // a current registry filing
    "EX-5": { outcome: "decline", flags: 1, missing: 0 },      // shareholder list and ID check disagree on residence
    "EX-6": { outcome: "escalate", flags: 0, missing: 1 },     // the pending sanctions check
  };
  for (const id of IDS) it(`${id} passes with the right outcome`, () => {
    const r = run(load(id));
    expect(r.problems).toEqual([]);
    expect(r.passed).toBe(true);
    expect({ outcome: r.outcome, flags: r.flags.length, missing: r.missing.length }).toEqual(expected[id]);
  });

  it("explains what's missing in plain sentences", () => {
    expect(run(load("EX-2")).missing).toEqual(["Find who holds 30% (300 Class B (non-voting, economic) units). 30% is unaccounted for, so someone unidentified could own 25% or more (3.3)."]);
    expect(run(load("EX-5")).flags[0]).toContain("Documents disagree on where Dariush Karimi lives");
    expect(run(load("EX-6")).missing).toEqual(["Sanctions for Thomas Finch is still unknown, and 4.1 and 4.2 need it."]);
    expect(run(load("EX-6")).notes).toEqual(["4.1 could still apply once sanctions for Thomas Finch is known, and would mean decline."]);
  });
});

// The mistakes a hurried agent makes. Each one, planted in an honest file, must fail it with a plain reason.
describe("planted mistakes are caught", () => {
  const broken = (id: string, edit: (f: CaseFile) => void) => { const f = load(id); edit(f); return run(f); };
  const kinds = (r: ReturnType<typeof run>) => r.problems.map((p) => p.kind);

  it("a made-up quote", () => {
    const r = broken("EX-1", (f) => { f.ownership!.holders[0].quote = "Dana Ruiz | 350 units | 53.0%"; });
    expect(r.passed).toBe(false);
    expect(r.problems[0].text).toBe(`The quote "Dana Ruiz | 350 units | 53.0%" for Dana Ruiz's 35% isn't in cap_table.md p.1.`);
  });

  it("a quote cited from the wrong page", () => {
    expect(kinds(broken("EX-4", (f) => { f.entity.registry_filed!.source = "registry.md p.1"; }))).toEqual(["quote"]);
  });

  it("a vendor result read wrong", () => {
    const r = broken("EX-1", (f) => { f.people[2].pep!.value = "no"; f.outcome = "approve"; });
    expect(r.problems.map((p) => p.text)).toContain('PEP screening for Priya Shah says "no", but screening_priya_shah.json (pep.hits) says "yes".');
  });

  it("a pending sanctions check written as clear", () => {
    expect(kinds(broken("EX-6", (f) => { f.people[1].sanctions!.value = "none"; }))).toEqual(["quote"]);
  });

  it("an owner behind a company never looked up (EX-1's hurried approve)", () => {
    const r = broken("EX-1", (f) => { f.ownership!.holders[1].owners = null; f.people = f.people.filter((p) => p.name !== "Priya Shah"); f.outcome = "approve"; });
    expect(kinds(r)).toEqual(["outcome"]);
    expect(r.outcome).toBe("request_docs");
    expect(r.missing[0]).toBe("Find the owners of Halcyon Holdings LLC (holds 40%). 40% is unaccounted for, so someone unidentified could own 25% or more (3.3).");
  });

  it("an owner of 25% or more left out of the people list", () => {
    const r = broken("EX-3", (f) => { f.people = f.people.filter((p) => p.name !== "Helen Cho"); f.searches = f.searches!.filter((s) => s.subject !== "Helen Cho"); });
    expect(r.problems.map((p) => p.text)).toEqual(["Helen Cho owns 40% but has no ID check or screening in the file."]);
  });

  it("the Class B units ignored (EX-2's hurried approve)", () => {
    const r = broken("EX-2", (f) => { f.ownership!.holders.pop(); f.outcome = "approve"; });
    expect(kinds(r)).toEqual(["outcome"]);
  });

  it("adverse media from a weak, name-only source", () => {
    const r = broken("EX-2", (f) => { f.people[0].adverse_media = { value: "yes", source: "web", quote: "x" }; f.outcome = "escalate"; });
    expect(kinds(r)).toContain("web");
  });

  it("a search that wasn't recorded", () => {
    expect(broken("EX-3", (f) => { f.searches = f.searches!.slice(1); }).problems.map((p) => p.text))
      .toEqual(["No adverse media search is recorded for Cedar Ridge Payments, Inc.. 4.4 needs the terms, the date and the sources reviewed."]);
  });

  it("a control person with a title FinCEN doesn't list and no quote about what they do", () => {
    const r = broken("EX-4", (f) => { f.control_person!.reasons = [{ kind: "role", title: "Executive Director", source: "registry.md p.2", quote: "MARIA GOMEZ (Executive Director)" }]; });
    expect(kinds(r)).toEqual(["judgment"]);
  });

  it("the stale filing missed (EX-4's hurried approve)", () => {
    const r = broken("EX-4", (f) => { f.outcome = "approve"; });
    expect(r.problems[0].text).toBe("The file says approve, but the facts in it lead to request docs: 3.5 applies.");
  });

  it("the move to Tehran missed (EX-5's hurried approve)", () => {
    const r = broken("EX-5", (f) => { const p = f.people[1]; p.residence = { value: "DE", source: "shareholder_list.md p.1", quote: "Dariush Karimi, born 1969-01-14 | Hamburg" }; f.outcome = "approve"; });
    expect(kinds(r)).toEqual([]); // every quote is real, so the file is consistent with what it says...
    expect(r.passed).toBe(true);  // ...which is the limit of these checks: the newer ID check was never cited.
  });
});
