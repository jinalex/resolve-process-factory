import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CaseFile, Documents, checkCase, fieldSays } from "./case-file.ts";
import { EvidenceCheck } from "../../core/evidence.ts";
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
      .toEqual(["No adverse media search is recorded for Cedar Ridge Payments, Inc. 4.4 needs the terms, the date and the sources reviewed."]);
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

// Ways a file can break the checks themselves: odd sources, values a vendor field allows more than one reading of,
// shares that aren't numbers, and people the SOP needs that the ownership tree alone doesn't name.
describe("the checks hold up on odd files", () => {
  const broken = (id: string, edit: (f: CaseFile) => void) => { const f = load(id); edit(f); return run(f); };
  const texts = (r: ReturnType<typeof run>, kind: string) => r.problems.filter((p) => p.kind === kind).map((p) => p.text);
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), "resolve-"));
    writeFileSync(join(dir, "hits.json"), JSON.stringify({ sanctions: { hits: [{ list: "OFAC SDN" }] } }));
    writeFileSync(join(dir, "broken.json"), "{ not json");
    mkdirSync(join(dir, "folder.json"));
    return dir;
  };

  it("a source outside the case's folder isn't read", () => {
    const docs = new Documents(join(ROOT, "cases/examples/cedar-ridge-payments"));
    expect(docs.text("../northwind-coffee/cap_table.md")).toBeNull();
    expect(docs.json("../northwind-coffee/idv_dana_ruiz.json")).toBeUndefined();
    const r = broken("EX-3", (f) => { f.entity.registry_filed!.source = "../northwind-coffee/registry.md"; });
    expect(texts(r, "quote")[0]).toContain("isn't among the case's documents");
  });

  it("a source that is a folder or broken JSON is reported, not a crash", () => {
    const ev = new EvidenceCheck(new Documents(scratch()), fieldSays);
    ev.fact({ value: "none", source: "folder.json", field: "sanctions.hits" }, "a", "sanctions");
    ev.fact({ value: "none", source: "broken.json", field: "sanctions.hits" }, "b", "sanctions");
    ev.quote({ source: "folder.json", quote: "x" }, "c");
    expect(ev.problems.map((p) => p.kind)).toEqual(["quote", "quote", "quote"]);
  });

  it("a sanctions hit can't be written as none, but a person may call it potential or confirmed", () => {
    const ev = new EvidenceCheck(new Documents(scratch()), fieldSays);
    for (const value of ["none", "potential", "confirmed"]) ev.fact({ value, source: "hits.json", field: "sanctions.hits" }, value, "sanctions");
    expect(ev.problems.map((p) => p.text)).toEqual(['none says "none", but hits.json (sanctions.hits) says "potential" or "confirmed".']);
  });

  it("a licence lookup read wrong", () => {
    const r = broken("EX-3", (f) => { f.entity.licence_verified!.value = "no"; });
    expect(texts(r, "quote")).toEqual(['whether Cedar Ridge Payments, Inc.\'s licence is verified says "no", but licence_lookup.json (licences) says "yes".']);
    expect(fieldSays("licence_verified", [{ status: "Approved", authorized_to_conduct_business: false }])).toBe("no");
  });

  it("a quote is checked even when a vendor field is cited too", () => {
    const r = broken("EX-1", (f) => { f.people[0].sanctions!.quote = "no matches found for anyone"; });
    expect(texts(r, "quote")).toHaveLength(1);
  });

  it("a share that isn't a number leaves ownership unknown instead of crashing", () => {
    const r = broken("EX-3", (f) => { (f.ownership!.holders[1] as { pct: unknown }).pct = "majority"; });
    expect(texts(r, "missing")).toContain(`Helen Cho's share is written "majority", which isn't a percentage.`);
    expect(r.passed).toBe(false);
  });

  it("adverse media cited to the web passes when the quote is in a listed result", () => {
    const r = broken("EX-2", (f) => {
      f.people[0].adverse_media = { value: "yes", source: "web", quote: "a broker named Marcus Bell stiffed them on six loads" };
      f.outcome = "escalate";
    });
    expect(texts(r, "quote")).toEqual([]);
    expect(texts(r, "web")).toHaveLength(1); // still a weak, name-only source under 4.4
  });

  it("an owner the unaccounted shares could lift to 25% must be screened", () => {
    const r = broken("EX-2", (f) => {
      f.ownership!.holders[1].pct = 10; f.ownership!.holders[2].pct = 45;
      f.people = f.people.filter((p) => p.name !== "Ana Okafor");
    });
    expect(texts(r, "people")).toEqual(["Ana Okafor owns 10% but has no ID check or screening in the file."]);
  });

  it("an owner the customer certifies at 25% or more must be screened, even when the tree can't be read", () => {
    const r = broken("EX-3", (f) => {
      (f.ownership!.holders[0] as { pct: unknown }).pct = "most";
      f.people = f.people.filter((p) => p.name !== "Helen Cho");
    });
    expect(texts(r, "people")).toEqual(["Helen Cho owns 40% but has no ID check or screening in the file."]);
  });
});
