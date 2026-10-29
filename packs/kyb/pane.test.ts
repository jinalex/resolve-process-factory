import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../../core/load.ts";
import { shutdown } from "../../core/z3.ts";
import { Documents, type CaseFile, checkCase } from "./case-file.ts";
import { kybSpec, pastCases } from "./examples.ts";
import { readAnswers } from "../../core/answers.ts";
import { nextSpec } from "../../core/next-spec.ts";
import { decidedBy, paneCase, rulesLine, writePane } from "./pane.ts";
import { CASES, SPEC, STATUS } from "../../mod/resolve/tests/real-run.ts";

afterAll(shutdown);

// The pane's files as `pnpm resolve` writes them (docs/INTERFACE.md).
const spec = kybSpec();
const read = (dir: string, name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const FIXTURES = join(ROOT, "packs/kyb/fixtures/case-files");
const fixture = (id: string) => JSON.parse(readFileSync(join(FIXTURES, `${id}.json`), "utf8")) as CaseFile & { dir: string };
const check = (f: CaseFile & { dir: string }) => checkCase(spec, f, new Documents(join(ROOT, "cases/examples", f.dir)));
const tmp = () => mkdtempSync(join(tmpdir(), "resolve-pane-"));
// A copy of the six case files, with one changed.
function casesWith(id: string, change: (f: CaseFile & { dir: string }) => void) {
  const dir = tmp();
  cpSync(FIXTURES, dir, { recursive: true });
  const f = fixture(id);
  change(f);
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(f));
  return dir;
}

describe("pnpm resolve on the six example case files", () => {
  let out: string;
  beforeAll(async () => { out = tmp(); await writePane({ spec, out }); }, 60_000);

  it("writes the three files whole, with no temporary files left", () => {
    expect(readdirSync(out).sort()).toEqual(["cases.json", "spec.json", "status.json"]);
  });

  it("spec.json has every SOP paragraph in full, every rule's Z3 formula, and Z3's findings", () => {
    const s = read(out, "spec.json");
    expect(s).toMatchObject({ domain: "kyb", version: spec.version, approved: false, sop_title: "KYB Onboarding Review: Level 1 Standard Operating Procedure" });
    for (const r of spec.rules) expect(s.sop.find((x: { ref: string }) => x.ref === r.sop).rules).toContain(r.id);
    const sop = (ref: string) => s.sop.find((x: { ref: string }) => x.ref === ref);
    expect(sop("3.3").text).not.toContain("...");                     // the SOP's own paragraph, not the spec's shortened one
    expect(sop("3.3").text).toMatch(/could own 25% or more/);
    expect(sop("3.1")).toMatchObject({ rules: [], covered: false });  // no rule is written from 3.1
    expect(sop("2.2")).toMatchObject({ rules: [], covered: true });   // the unknowns rule covers it
    expect(s.rules.find((r: { id: string }) => r.id === "control-person").code).toBe("(and (= excluded_c no) (= control_person_identified_c no))");
    for (const r of s.rules) expect(r.code).not.toMatch(/_c \d+\)/);  // values print as names, not Z3's numbers
    expect(s.findings.map((f: { id: string }) => f.id).sort()).toEqual(["dead-msb-licensed", "unknown-id-verified", "unused-licence_verified"]);
    for (const f of s.findings) expect(f).toMatchObject({ question: null, options: [], answer: null, proof: { answer: expect.any(String) } });
  });

  it("spec.json's facts name what an open fact can be, and include the facts the pack computes", () => {
    const facts = read(out, "spec.json").facts;
    const fact = (key: string) => facts.find((f: { key: string }) => f.key === key);
    expect(fact("country").values).toEqual(expect.arrayContaining(["IR", "KP", "other", "unknown"]));
    expect(fact("pep")).toMatchObject({ name: "Politically exposed", per: "people", required_by: ["4.3"] });
    expect(fact("unidentified_pct")).toMatchObject({ computed: true, required_by: ["3.3"] });
    expect(fact("industry").sop_words).toEqual({
      prohibited: ["marijuana-related business", "adult content", "unlicensed money transmission"],
      msb: ["money services business"], crypto: ["virtual currency"],
    });
    expect(fact("pep")).not.toHaveProperty("sop_words");
  });

  it("cases.json gives each case's outcome, the SOP paragraph behind it, and what the check found", () => {
    const { cases } = read(out, "cases.json");
    expect(cases.map((c: { id: string }) => c.id)).toEqual(["EX-1", "EX-2", "EX-3", "EX-4", "EX-5", "EX-6"]);
    const ex2 = cases.find((c: { id: string }) => c.id === "EX-2");
    expect(ex2).toMatchObject({ name: "Bluefin Logistics LLC", outcome: "request_docs", check: { passed: true, expected: "request_docs", spec_outcome: "request_docs" } });
    expect(ex2.decided_by).toMatch(/^3\.3: Unless the entity is excluded/);
    expect(ex2.decided_by).not.toContain("...");
    expect(ex2.ownership.unaccounted_pct).toBe(30);
    expect(ex2.ownership.holders.find((h: { pct: number }) => h.pct === 30)).toMatchObject({ name: "Unidentified holders", type: "pool" });
    expect(ex2.ownership.holders.find((h: { name: string }) => h.name === "Marcus Bell")).toMatchObject({ type: "person", verified: true });
    expect(ex2.missing[0]).toMatch(/30% is held by nobody identified/);
    const ex1 = cases.find((c: { id: string }) => c.id === "EX-1");
    expect(ex1.facts.find((f: { key: string }) => f.key === "control_person")).toMatchObject({ value: "Dana Ruiz, Managing Member", how: "judgment" });
    expect(ex1.facts.find((f: { key: string }) => f.key === "licence_verified")).toMatchObject({ value: "unknown", source: "" });
  });

  it("never shows the expert a rule ID", () => {
    const ids = spec.rules.map((r) => r.id);
    const s = read(out, "spec.json"), { cases } = read(out, "cases.json");
    const shown = [
      ...s.sop.map((x: { text: string }) => x.text),
      ...s.findings.flatMap((f: Record<string, string>) => [f.title, f.explain, f.example]),
      ...cases.flatMap((c: { decided_by: string; missing: string[]; notes: string[]; check: { problems: string[]; flags: string[] } }) =>
        [c.decided_by, ...c.missing, ...c.notes, ...c.check.problems, ...c.check.flags]),
    ].join("\n");
    for (const id of ids) expect(shown).not.toContain(id);
  });

  it("status.json ends at the cases stage, counting unanswered findings and case files with flags", () => {
    expect(read(out, "status.json")).toMatchObject({ stage: 2, state: "needs_review",
      activity: "3 of 3 findings on the rules need an answer; the rules give the file's outcome in 6 of 6 cases, and 3 have something for a person to check." });
  });

  it("a rerun keeps what Claude and the expert gave a finding, and counts it as answered", async () => {
    const s = read(out, "spec.json");
    const id = s.findings[0].id;
    s.findings[0] = { ...s.findings[0], question: "Should 5.3 win over 5.2?", options: ["Yes", "No"], answer: { choice: "Yes", at: "2026-10-28" } };
    s.approved = true;
    writeFileSync(join(out, "spec.json"), JSON.stringify(s));
    await writePane({ spec, out });
    const again = read(out, "spec.json");
    expect(again.findings.find((f: { id: string }) => f.id === id)).toMatchObject({ question: "Should 5.3 win over 5.2?", options: ["Yes", "No"], answer: { choice: "Yes" } });
    expect(again.approved).toBe(true);
    expect(read(out, "status.json").activity).toMatch(/^2 of 3 findings/);
  }, 60_000);
});

describe("a rerun after something changed", () => {
  const answered = async (edit: (s: Record<string, unknown> & { findings: Record<string, unknown>[] }) => void) => {
    const out = tmp();
    await writePane({ spec, out });
    const s = read(out, "spec.json");
    s.findings = s.findings.map((f: object) => ({ ...f, question: "Old question?", options: ["A", "B"], answer: { choice: "A", at: "2026-10-28" } }));
    s.approved = true;
    edit(s);
    writeFileSync(join(out, "spec.json"), JSON.stringify(s));
    return out;
  };

  it("drops the answer when the finding now says something else", async () => {
    const out = await answered((s) => { s.findings[0].explain = "Z3 used to say something different here."; });
    await writePane({ spec, out });
    const [first, second] = read(out, "spec.json").findings;
    expect(first).toMatchObject({ question: null, answer: null });
    expect(second).toMatchObject({ question: "Old question?" });
  }, 60_000);

  it("drops answers and approval from another spec version or domain", async () => {
    for (const edit of [(s: Record<string, unknown>) => { s.version = 0; }, (s: Record<string, unknown>) => { s.domain = "expenses"; }]) {
      const out = await answered(edit);
      await writePane({ spec, out });
      const s = read(out, "spec.json");
      expect(s.approved).toBe(false);
      for (const f of s.findings) expect(f.answer).toBeNull();
    }
  }, 60_000);

  it("keeps answers but drops approval when the same version's spec was edited", async () => {
    const out = await answered((s) => { s.spec_hash = "an older spec"; });
    await writePane({ spec, out });
    const s = read(out, "spec.json");
    expect(s.approved).toBe(false);
    for (const f of s.findings) expect(f.answer).toMatchObject({ choice: "A" });
  }, 60_000);
});

describe("answering a finding and making the next version", () => {
  // The options Claude would write for 3.4's unknowns finding (pnpm write-options), written by hand here.
  const r34 = spec.rules.find((r) => r.id === "id-verified")!;
  const option_edits = [
    { option: "Ask for documents now", says: "3.4 asks for documents while an ID check hasn't come back.", edits: [] },
    { option: "Incomplete until the check comes back", says: "3.4 asks for documents only when an ID check failed.",
      edits: [{ op: "replace_rule", rule: { ...r34, when: { some: "people", where: { fact: "id_verified", is: "no" } } } }] },
  ];
  let out: string;
  beforeAll(async () => {
    out = tmp();
    await writePane({ spec, out });
    const s = read(out, "spec.json");
    const f = s.findings.find((x: { id: string }) => x.id === "unknown-id-verified");
    Object.assign(f, { question: "Should a missing ID check send the case back as incomplete?", options: option_edits.map((o) => o.option), option_edits });
    writeFileSync(join(out, "spec.json"), JSON.stringify(s));
    await writePane({ spec, out });
  }, 180_000);

  it("works out what each option would change before the owner answers", () => {
    const f = read(out, "spec.json").findings.find((x: { id: string }) => x.id === "unknown-id-verified");
    expect(f.option_edits).toEqual(option_edits);
    const [keep, fix] = f.impact;
    expect(keep).toMatchObject({ option: "Ask for documents now", keeps_rules: true, resolves: false, changes: [] });
    expect(fix).toMatchObject({ option: "Incomplete until the check comes back", problems: [], resolves: true, new_findings: [] });
    expect(fix.changes.map((c: { from: string; to: string }) => [c.from, c.to])).toEqual([["request_docs", "incomplete"]]);
    expect(fix.changes[0].example).toMatch(/ID check|id verified/i);
    expect(fix.changes[0].example).not.toMatch(/id-verified/);       // plain words, no rule IDs
    expect(f.severity).toBe("normal");                                // neither option moves a case into or out of decline or approve
    // Other findings have no options yet, so nothing is worked out for them.
    expect(read(out, "spec.json").findings.filter((x: { impact?: unknown }) => x.impact)).toHaveLength(1);
  });

  it("turns the sent answer into version 2, which shows what it changed and stays unapproved until approved", async () => {
    const s = read(out, "spec.json");
    const f = s.findings.find((x: { id: string }) => x.id === "unknown-id-verified");
    const lines = [
      { type: "finding", id: f.id, rule_ids: f.rule_ids, choice: "Incomplete until the check comes back", spec_version: 1, at: "2026-10-29T07:00:00Z" },
      { type: "send", ids: [f.id], spec_version: 1, at: "2026-10-29T07:00:01Z" },
    ];
    writeFileSync(join(out, "answers.jsonl"), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
    const answers = readAnswers(readFileSync(join(out, "answers.jsonl"), "utf8"), 1);
    const r = await nextSpec(spec, { path: "spec/kyb-v1.json" }, s, answers.findings, pastCases());
    expect(r.problems).toEqual([]);
    expect(r.spec!.rules.find((x) => x.id === "id-verified")!.when).toEqual(option_edits[1].edits[0].rule!.when);
    expect(r.findings.map((x) => x.id)).not.toContain("unknown-id-verified");

    await writePane({ spec: r.spec!, out });
    const v2 = read(out, "spec.json");
    expect(v2).toMatchObject({ version: 2, approved: false, applied: [{ id: "unknown-id-verified", choice: "Incomplete until the check comes back", applied_in: 2 }] });
    expect(v2.changes_from_previous.map((c: { from: string; to: string }) => [c.from, c.to])).toEqual([["request_docs", "incomplete"]]);
    expect(v2.findings.map((x: { id: string }) => x.id)).not.toContain("unknown-id-verified");

    // The owner approves version 2 in the pane; the next run marks it approved.
    writeFileSync(join(out, "answers.jsonl"), readFileSync(join(out, "answers.jsonl"), "utf8") + JSON.stringify({ type: "approve_spec", version: 2, spec_version: 2, spec_hash: v2.spec_hash, at: "t" }) + "\n");
    await writePane({ spec: r.spec!, out });
    expect(read(out, "spec.json").approved).toBe(true);
  }, 180_000);
});

describe("a run that can't finish", () => {
  it("leaves a spec.json it can't read alone, and says why", async () => {
    for (const bad of ['{"version": 1, "findings": [', '{"version": 1, "findings": {}}']) {
      const out = tmp();
      writeFileSync(join(out, "spec.json"), bad);
      await expect(writePane({ spec, out })).rejects.toThrow(/answers can't be kept/);
      expect(readFileSync(join(out, "spec.json"), "utf8")).toBe(bad);
      expect(read(out, "status.json")).toMatchObject({ state: "failed" });
    }
  });

  it("keeps the last good run when a case file is broken", async () => {
    const out = tmp();
    await writePane({ spec, out });
    const before = readFileSync(join(out, "cases.json"), "utf8");
    const files = tmp();
    cpSync(FIXTURES, files, { recursive: true });
    writeFileSync(join(files, "EX-2.json"), "{ not json");
    await expect(writePane({ spec, out, caseFiles: files })).rejects.toThrow(/EX-2\.json isn't valid JSON/);
    expect(readFileSync(join(out, "cases.json"), "utf8")).toBe(before);
    expect(read(out, "status.json")).toMatchObject({ state: "failed", activity: "The case file EX-2.json isn't valid JSON." });
  }, 60_000);
});

describe("what the expert reads about a case", () => {
  it("fails a case file with a made-up quote and says why", async () => {
    const out = tmp();
    await writePane({ spec, out, caseFiles: casesWith("EX-2", (f) => { f.ownership!.holders[0].quote = "Marcus Bell | 450 | 55.0%"; }) });
    const ex2 = read(out, "cases.json").cases.find((c: { id: string }) => c.id === "EX-2");
    expect(ex2.check.passed).toBe(false);
    expect(ex2.check.problems.join(" ")).toMatch(/isn't in cap_table\.md/);
    expect(read(out, "status.json").activity).toMatch(/6 of 6 cases, and 4 have something for a person to check/);
  }, 60_000);

  it("says a case is held back by an unknown fact under 2.2, not by the rules that might apply", () => {
    const f = fixture("EX-4");
    f.entity.registry_filed = { value: "2026-09-01", source: "registry.md p.1", quote: "x" };
    delete f.entity.screening!.sanctions;
    f.outcome = "incomplete";
    const c = check(f);
    expect(c.outcome).toBe("incomplete");
    expect(decidedBy(spec, f, c)).toBe("2.2: sanctions screening (business) is unknown, so the case can't be decided yet. Once known, 4.1 could mean decline and 4.2 could mean escalate.");
    expect(paneCase(spec, f, c, "x").facts.find((x: Record<string, unknown>) => x.key === "entity_sanctions")).toMatchObject({ value: "unknown" });
  });

  it("says so first when the file's outcome isn't the spec's", () => {
    const f = fixture("EX-3");
    f.outcome = "approve";
    expect(paneCase(spec, f, check(f), "x").check.outcome_follows).toBe(false);
    expect(decidedBy(spec, f, check(f))).toMatch(/^The file says approve, but the spec gives escalate\. 5\.2: /);
  });

  it("shows trusts and holders nobody named as unaccounted, and an excluded entity without owners to find", () => {
    const f = fixture("EX-2");
    f.ownership!.holders = [
      { name: "Family Trust", type: "trust", pct: 30, source: "cap_table.md p.1", quote: "x", owners: [{ name: "Ann Trustee", type: "person", pct: 100, source: "cap_table.md p.1", quote: "x" }] },
      { name: "Big Bank", type: "excluded_entity", pct: 40, source: "cap_table.md p.1", quote: "x" },
      { name: null, type: "person", pct: 30, source: "cap_table.md p.1", quote: "x" },
    ];
    const { holders, unaccounted_pct } = paneCase(spec, f, check(f), "x").ownership!;
    expect(holders).toEqual([
      { name: "Family Trust (trust)", type: "pool", pct: 30, source: "cap_table.md p.1" },
      { name: "Big Bank (excluded entity)", type: "entity", pct: 40, source: "cap_table.md p.1" },
      { name: "Unidentified holders", type: "pool", pct: 30, source: "cap_table.md p.1" },
    ]);
    expect(unaccounted_pct).toBe(60);
  });

  it("marks a control person whose reasons don't meet 3.2", () => {
    const f = fixture("EX-1");
    f.control_person = { name: "Dana Ruiz", reasons: [{ kind: "role", title: "Barista", source: "operating_agreement.md p.3", quote: "Dana Ruiz" }] };
    const cp = paneCase(spec, f, check(f), "x").facts.find((x: Record<string, unknown>) => x.key === "control_person");
    expect(cp?.problem).toMatch(/3\.2 isn't met/);
  });
});

describe("the command line", () => {
  const run = (args: string[], cwd: string) => spawnSync(process.execPath, [join(ROOT, "packs/kyb/write-pane.ts"), ...args], { cwd, env: { ...process.env, INIT_CWD: cwd }, encoding: "utf8" });

  it("reads --out from the folder it was run in", () => {
    const here = tmp();
    const r = run(["--out", "my-run"], here);
    expect(r.status).toBe(0);
    expect(existsSync(join(here, "my-run", "spec.json"))).toBe(true);
  }, 60_000);

  it("with no spec named, stays on the version the pane shows", () => {
    // A v2 beside v1, as pnpm next-spec leaves it. A rerun must not roll the pane back to v1.
    const v2 = join(ROOT, "spec/kyb-v2.json");
    if (existsSync(v2)) return;
    writeFileSync(v2, JSON.stringify({ ...JSON.parse(readFileSync(join(ROOT, "spec/kyb-v1.json"), "utf8")), version: 2 }));
    try {
      const here = tmp();
      writeFileSync(join(here, "spec.json"), JSON.stringify({ domain: "kyb", version: 2, findings: [] }));
      const r = run(["--out", "."], here);
      expect(r.stdout).toContain("from spec/kyb-v2.json");
      expect(read(here, "spec.json").version).toBe(2);
      writeFileSync(join(here, "spec.json"), JSON.stringify({ domain: "kyb", version: 9, findings: [] }));
      expect(run(["--out", "."], here).stdout).toContain("from spec/kyb-v1.json");   // no such version: the default
    } finally { rmSync(v2) }
  }, 120_000);

  it("refuses an option it doesn't know, or one with no folder", () => {
    expect(run(["--help"], tmp()).status).toBe(2);
    expect(run(["--out"], tmp()).status).toBe(2);
  });
});

describe("the mod's copy of a real run", () => {
  // mod/resolve/tests/real-run.ts is what the pane's tests draw. It must stay what `pnpm resolve` writes, apart from
  // solve times, the time of writing, and the order Z3's simplifier prints a formula's terms in, which depends on
  // what else the same Z3 context has seen.
  const steady = (x: unknown) => JSON.parse(JSON.stringify(x, (k, v) => (k === "ms" || k === "updated_at" || k === "code" ? undefined : v)));
  it("matches what pnpm resolve writes now", async () => {
    const out = tmp();
    await writePane({ spec, out });
    expect(steady(read(out, "spec.json"))).toEqual(steady(SPEC));
    expect(steady(read(out, "cases.json"))).toEqual(steady(CASES));
    expect(steady(read(out, "status.json"))).toEqual(steady(STATUS));
  }, 60_000);
});

describe("the status line", () => {
  it("counts findings in words that agree", () => {
    expect(rulesLine(0, 0)).toBe("No findings on the rules");
    expect(rulesLine(1, 1)).toBe("1 of 1 finding on the rules needs an answer");
    expect(rulesLine(0, 1)).toBe("The finding on the rules is answered");
    expect(rulesLine(2, 3)).toBe("2 of 3 findings on the rules need an answer");
    expect(rulesLine(0, 3)).toBe("All 3 findings on the rules are answered");
  });
});
