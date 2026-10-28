import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../../core/load.ts";
import { shutdown } from "../../core/z3.ts";
import { kybSpec } from "./examples.ts";
import { writePane } from "./pane.ts";

afterAll(shutdown);

// The pane's files as `pnpm resolve` writes them (docs/INTERFACE.md).
const spec = kybSpec();
const read = (dir: string, name: string) => JSON.parse(readFileSync(join(dir, name), "utf8"));
const FIXTURES = join(ROOT, "packs/kyb/fixtures/case-files");

describe("pnpm resolve on the six example case files", () => {
  let out: string;
  beforeAll(async () => { out = mkdtempSync(join(tmpdir(), "resolve-pane-")); await writePane({ spec, out }); }, 60_000);

  it("writes the three files whole, with no temporary files left", () => {
    expect(readdirSync(out).sort()).toEqual(["cases.json", "spec.json", "status.json"]);
  });

  it("spec.json has every SOP section with a rule, every rule's Z3 formula, and Z3's findings", () => {
    const s = read(out, "spec.json");
    expect(s.version).toBe(spec.version);
    expect(s.sop_title).toBe("KYB Onboarding Review: Level 1 Standard Operating Procedure");
    for (const r of spec.rules) expect(s.sop.find((x: { ref: string }) => x.ref === r.sop).rules).toContain(r.id);
    for (const r of s.rules) expect(r.code).toMatch(/^\(/);
    expect(s.findings.map((f: { id: string }) => f.id).sort()).toEqual(["dead-msb-licensed", "unknown-id-verified", "unused-licence_verified"]);
    for (const f of s.findings) expect(f).toMatchObject({ question: null, options: [], answer: null, proof: { answer: expect.any(String) } });
  });

  it("cases.json gives each case's outcome, the SOP sentence behind it, and what the check found", () => {
    const { cases } = read(out, "cases.json");
    expect(cases.map((c: { id: string }) => c.id)).toEqual(["EX-1", "EX-2", "EX-3", "EX-4", "EX-5", "EX-6"]);
    const ex2 = cases.find((c: { id: string }) => c.id === "EX-2");
    expect(ex2).toMatchObject({ name: "Bluefin Logistics LLC", outcome: "request_docs", check: { passed: true, expected: "request_docs" } });
    expect(ex2.decided_by).toMatch(/^3\.3: /);
    expect(ex2.ownership.unaccounted_pct).toBe(30);
    expect(ex2.missing[0]).toMatch(/30% is unaccounted for/);
  });

  it("never shows the expert a rule ID", () => {
    const ids = spec.rules.map((r) => r.id);
    const s = read(out, "spec.json"), { cases } = read(out, "cases.json");
    const shown = [
      ...s.findings.flatMap((f: Record<string, string>) => [f.title, f.explain, f.example]),
      ...cases.flatMap((c: { decided_by: string; missing: string[]; check: { problems: string[] } }) => [c.decided_by, ...c.missing, ...c.check.problems]),
    ].join("\n");
    for (const id of ids) expect(shown).not.toContain(id);
  });

  it("status.json ends at the cases stage, waiting on the expert's answers", () => {
    expect(read(out, "status.json")).toMatchObject({ stage: 2, state: "needs_review", activity: "3 questions on the rules; 6 of 6 case files pass." });
  });

  it("a rerun keeps the question, options and answer Claude and the expert gave a finding", async () => {
    const s = read(out, "spec.json");
    s.findings[0] = { ...s.findings[0], question: "Should 5.3 win over 5.2?", options: ["Yes", "No"], answer: { choice: "Yes", at: "2026-10-28" } };
    writeFileSync(join(out, "spec.json"), JSON.stringify(s));
    await writePane({ spec, out });
    expect(read(out, "spec.json").findings[0]).toMatchObject({ question: "Should 5.3 win over 5.2?", options: ["Yes", "No"], answer: { choice: "Yes" } });
  }, 60_000);
});

describe("pnpm resolve on a case file with a made-up quote", () => {
  it("fails that case file and says why", async () => {
    const files = mkdtempSync(join(tmpdir(), "resolve-cases-")), out = mkdtempSync(join(tmpdir(), "resolve-pane-"));
    cpSync(FIXTURES, files, { recursive: true });
    const f = JSON.parse(readFileSync(join(files, "EX-2.json"), "utf8"));
    f.ownership.holders[0].quote = "Marcus Bell | 450 | 55.0%";
    writeFileSync(join(files, "EX-2.json"), JSON.stringify(f));
    await writePane({ spec, out, caseFiles: files });
    const ex2 = read(out, "cases.json").cases.find((c: { id: string }) => c.id === "EX-2");
    expect(ex2.check.passed).toBe(false);
    expect(ex2.check.problems.join(" ")).toMatch(/isn't in cap_table\.md/);
    expect(read(out, "status.json").activity).toMatch(/5 of 6 case files pass/);
  }, 60_000);
});
