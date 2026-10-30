import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type CaseFile, Documents, checkCase, fieldSays } from "./case-file.ts";
import { EvidenceCheck } from "../../core/evidence.ts";
import { ROOT } from "../../core/load.ts";
import { kybSpec } from "./examples.ts";
import { CERTIFICATION_FACT, UNREAD_CERTIFICATION } from "./facts.ts";

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
    "EX-4": { outcome: "request_docs", flags: 1, missing: 1 }, // a current registry filing; the control person rests on what she does
    "EX-5": { outcome: "decline", flags: 2, missing: 0 },      // shareholder list and ID check disagree on residence; control person by function
    "EX-6": { outcome: "escalate", flags: 0, missing: 1 },     // the pending sanctions check
  };
  for (const id of IDS) it(`${id} passes with the right outcome`, () => {
    const r = run(load(id));
    expect(r.problems).toEqual([]);
    expect(r.passed).toBe(true);
    expect({ outcome: r.outcome, flags: r.flags.length, missing: r.missing.length }).toEqual(expected[id]);
  });

  it("explains what's missing in plain sentences", () => {
    expect(run(load("EX-2")).missing).toEqual(["Find who holds 30% (300 Class B (non-voting, economic) units). 30% is held by nobody identified, so someone unidentified could own 25% or more (3.3)."]);
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
    expect(r.missing[0]).toBe("Find the owners of Halcyon Holdings LLC (holds 40%). 40% is held by nobody identified, so someone unidentified could own 25% or more (3.3).");
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

// What the Codex, Grok and Gemini reviews found: wrong files that passed, honest ones that failed, and crashes.
// Each test fails on the code before the fix.
describe("files the reviews broke", () => {
  const broken = (id: string, edit: (f: CaseFile) => void) => { const f = load(id); edit(f); return run(f); };
  const texts = (r: ReturnType<typeof run>, kind: string) => r.problems.filter((p) => p.kind === kind).map((p) => p.text);
  type Loose = Record<string, any>;  // to write what a careless or hostile agent might

  it("a quote that is only formatting or spaces is no quote", () => {
    for (const quote of ["|", " | ** ", "   "]) {
      const r = broken("EX-1", (f) => { f.people[2].pep = { value: "no", source: "application.md p.1", quote }; f.outcome = "approve"; });
      expect(r.passed).toBe(false);
    }
    const r = broken("EX-3", (f) => { for (const h of f.ownership!.holders) h.quote = ""; });
    expect(texts(r, "missing")).toEqual(["Rafael Ortiz's 60% has no quote from its source.", "Helen Cho's 40% has no quote from its source."]);
  });

  it("a share, a holder's name and a filing date must be what their quote says", () => {
    const shares = broken("EX-1", (f) => {
      f.ownership!.holders[0].pct = 55; f.ownership!.holders[1].pct = 20;
      f.certification!.owners[0].pct = 55; f.certification!.owners[2].pct = 20;
      f.people = f.people.filter((p) => p.name !== "Priya Shah"); f.searches = f.searches!.filter((s) => s.subject !== "Priya Shah"); f.outcome = "approve";
    });
    expect(texts(shares, "quote")).toHaveLength(4);
    const name = broken("EX-3", (f) => { f.ownership!.holders[1].name = "Helen Chu"; });
    expect(texts(name, "quote")[0]).toBe(`The quote "Helen Cho | 4,000,000 | 40.0%" doesn't state Helen Chu's 40%.`);
    const date = broken("EX-4", (f) => { f.entity.registry_filed!.value = "2026-08-14"; f.outcome = "approve"; });
    expect(texts(date, "quote")).toEqual([`The quote "2025 | Filed | 8/14/2025" doesn't state the date 2026-08-14.`]);
  });

  it("a vendor field of the wrong shape, or with no reader, can't be cited", () => {
    for (const field of ["pep", "pep.hits.length", "toString"])
      expect(broken("EX-1", (f) => { f.people[2].pep = { value: "no", source: "screening_priya_shah.json", field }; f.outcome = "approve"; }).passed).toBe(false);
    const r = broken("EX-3", (f) => { f.entity.industry = { value: "normal", source: "screening_entity.json", field: "vendor" }; f.outcome = "approve"; });
    expect(texts(r, "quote")[0]).toContain("can't be read as");
  });

  it("a vendor result about someone else can't be cited", () => {
    const r = broken("EX-6", (f) => { f.people.find((p) => p.name === "Thomas Finch")!.sanctions = { value: "none", source: "screening_elena_sable.json", field: "sanctions.hits" }; });
    expect(texts(r, "quote")).toEqual(["sanctions screening for Thomas Finch cites screening_elena_sable.json, which is about Elena Sable, not Thomas Finch."]);
  });

  it("reads residence and nationality from the ID check", () => {
    const r = broken("EX-1", (f) => { f.people[0].residence!.value = "GB"; f.people[0].nationality!.value = "GB"; });
    expect(texts(r, "quote")).toHaveLength(2);
  });

  it("4.4 takes the publisher and tier from the search results, and one URL is one source", () => {
    const tierUp = broken("EX-2", (f) => {
      const h = f.web![0]; h.tier = "established"; h.matched = ["name", "role"];
      f.people[0].adverse_media = { value: "yes", source: "web", quote: h.quote }; f.outcome = "escalate";
    });
    expect(texts(tierUp, "web")).toHaveLength(1);
    const twice = broken("EX-2", (f) => {
      f.web![0].matched = ["name", "location"]; f.web!.push({ ...f.web![0], publisher: "Another Name" });
      f.people[0].adverse_media = { value: "yes", source: "web", quote: f.web![0].quote }; f.outcome = "escalate";
    });
    expect(texts(twice, "web")).toHaveLength(1);
  });

  it("a web quote must be in one result about that person, not across two", () => {
    const r = broken("EX-2", (f) => {
      f.web!.push({ ...f.web![0], url: "https://houstonbizjournal.example/2024/06/bluefin-adds-routes", quote: "Bluefin Logistics" });
      f.people[0].adverse_media = { value: "no", source: "web", quote: "did not respond to messages. Bluefin Logistics" };
    });
    expect(texts(r, "quote")).toHaveLength(2);
  });

  it("adverse media cited to an ordinary document must meet 4.4 too", () => {
    const r = broken("EX-2", (f) => { f.people[0].adverse_media = { value: "yes", source: "application.md p.1", quote: "Bluefin" }; f.outcome = "escalate"; });
    expect(texts(r, "web")).toHaveLength(1);
  });

  it("a strong report the file calls not adverse goes to a person, since 4.4 leaves 'material' to a person", () => {
    const r = broken("EX-2", (f) => f.web!.push({ about: "Marcus Bell", url: "https://houstonbizjournal.example/2024/06/bluefin-adds-routes",
      publisher: "Houston Business Journal", date: "2024-06-02", tier: "established", matched: ["name", "age"], quote: "led by president Marcus Bell, 43" }));
    expect(r.passed).toBe(true);
    expect(r.flags.at(-1)).toContain("A person should confirm the reports aren't material (4.4).");
  });

  it("a strong report meets 4.4 and the file escalates", () => {
    const r = broken("EX-2", (f) => {
      f.web!.push({ about: "Marcus Bell", url: "https://houstonbizjournal.example/2024/06/bluefin-adds-routes", publisher: "x", date: "2024-06-02",
        tier: "other", matched: ["name", "age"], quote: "led by president Marcus Bell, 43" });
      f.people[0].adverse_media = { value: "yes", source: "web", quote: "led by president Marcus Bell, 43" }; f.outcome = "escalate";
    });
    expect(texts(r, "web")).toEqual([]);
  });

  it("a search record needs its terms, date and sources", () => {
    const r = broken("EX-3", (f) => { f.searches = f.searches!.map((s) => ({ subject: s.subject, terms: "", date: "", sources: [] })); });
    expect(texts(r, "missing")).toHaveLength(3);
  });

  it("3.2: a role must be quoted with the person's name and that title; a function goes to a person", () => {
    const title = broken("EX-4", (f) => { f.control_person!.reasons = [{ kind: "role", title: "President", source: "registry.md p.2", quote: "MARIA GOMEZ (Executive Director)" }]; });
    expect(title.problems.map((p) => p.kind)).toContain("judgment");
    const other = broken("EX-2", (f) => { f.control_person!.name = "Ana Okafor"; });
    expect(other.problems.map((p) => p.kind)).toContain("judgment");
    const fn = broken("EX-4", (f) => { f.control_person!.reasons = [{ kind: "function", source: "application.md p.1", quote: "State of incorporation: Arizona" }]; });
    expect(fn.flags.at(-1)).toContain("A person should confirm it meets 3.2.");
  });

  it("a control person who doesn't meet 3.2 isn't identified, so 3.2 decides the outcome", () => {
    const r = broken("EX-2", (f) => { f.control_person!.reasons = []; });
    expect(r.decided_by).toContain("control-person");
  });

  it("a control person who isn't an owner must still be screened", () => {
    const r = broken("EX-4", (f) => { f.people = []; f.searches = f.searches!.filter((s) => s.subject !== "Maria Gomez"); });
    expect(texts(r, "people")).toEqual(["Maria Gomez is the control person but has no ID check or screening in the file."]);
  });

  it("odd files are reported, not crashes", () => {
    const edits: ((f: Loose) => void)[] = [
      (f) => { f.entity.registry_filed.source = "constructor"; },
      (f) => { delete f.people; },
      (f) => { delete f.control_person.reasons; },
      (f) => { f.ownership.holders[0].source = null; },
      (f) => { delete f.control_person.reasons[0].title; },
      (f) => { const h = f.ownership.holders[0]; h.type = "entity"; h.owners = [h]; },
      (f) => { f.certification.owners = undefined; },
    ];
    for (const edit of edits) expect(() => broken("EX-3", edit as (f: CaseFile) => void)).not.toThrow();
    expect(fieldSays("licence_verified", [null, 3])).toBe("no");
  });

  it("a file with no certification asks for it once, and never names its stand-in as a person (review of #25)", () => {
    for (const id of IDS) {
      const r = broken(id, (f) => { delete f.certification; });
      expect(r.problems).toEqual([]);
      for (const line of [...r.flags, ...r.missing, ...r.notes]) expect(line).not.toContain(UNREAD_CERTIFICATION);
    }
    const r = broken("EX-2", (f) => { delete f.certification; });
    expect(r.missing.filter((m) => m.toLowerCase().includes(CERTIFICATION_FACT))).toEqual([
      "The customer's ownership certification is still unknown, and 3.4 and 4.1 and 4.2 and 4.3 and 4.4 and 6.1 and 6.2 need it."]);
  });

  it("a certification with no owners list, or no document behind it, isn't on file (review of #25)", () => {
    // EX-3 with an ordinary industry approves with its certification; without one it can't.
    const normal = (f: CaseFile) => { f.entity.industry!.value = "normal"; f.outcome = "approve"; };
    expect(broken("EX-3", normal).outcome).toBe("approve");
    const loose = (f: CaseFile) => f as unknown as { certification: Record<string, unknown> };
    const edits: [(f: CaseFile) => void, string][] = [
      [(f) => { loose(f).certification.owners = undefined; }, "The certification has no list of owners, so it's read as not on file."],
      [(f) => { f.certification = { source: "not-on-file.md", owners: [] }; }, "The certification cites not-on-file.md, which isn't among the case's documents."],
    ];
    for (const [edit, text] of edits) {
      const r = broken("EX-3", (f) => { normal(f); edit(f); });
      expect(r.outcome).toBe("incomplete");
      expect(r.passed).toBe(false);
      expect(r.problems.map((p) => p.text)).toContain(text);
    }
  });

  it("nationality is optional: no rule uses it", () => {
    expect(broken("EX-1", (f) => { delete f.people[0].nationality; }).passed).toBe(true);
  });

  it("counts excluded entities under 25% in what's held by nobody identified (3.3)", () => {
    const r = broken("EX-2", (f) => {
      const h = f.ownership!.holders[2];
      Object.assign(h, { name: "Bank A", type: "excluded_entity", pct: 15 });
      f.ownership!.holders.push({ ...h, name: "Bank B" });
    });
    expect(r.missing).toContain("Find the remaining owners. 30% is held by nobody identified, so someone unidentified could own 25% or more (3.3).");
  });

  it("names a company deeper in the tree whose owners are unknown", () => {
    const r = broken("EX-1", (f) => { const h = f.ownership!.holders[1].owners![0]; h.name = "SubCo"; h.type = "entity"; h.owners = null; });
    expect(r.missing[0]).toBe("Find the owners of SubCo (holds 100%). 40% is held by nobody identified, so someone unidentified could own 25% or more (3.3).");
  });

  it("says the table is over 100% instead of a negative gap", () => {
    const r = broken("EX-2", (f) => { f.ownership!.holders[0].pct = 75; });
    expect(r.missing[0]).toBe("Correct the ownership table: the applicant: listed shares add up to 130% (3.3).");
  });
});
