// Runs Resolve's checks on a KYB spec and its case files and writes what the pane reads into `.resolve/`
// (docs/INTERFACE.md): Z3's findings on the SOP into spec.json, each case file and its check into cases.json,
// and each step into status.json, so the pane's stage strip follows the run.
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { PaneError, paneSpec, readPrevious, readSop, writeFile, writeStatus } from "../../core/pane.ts";
import { ruleFormulas } from "../../core/rule-formulas.ts";
import { checkSop } from "../../core/sop-checks.ts";
import type { Spec } from "../../core/spec.ts";
import { ROOT } from "../../core/load.ts";
import { type CaseFile, type Check, type Fact, type HolderEvidence, Documents, checkCase } from "./case-file.ts";
import { loadExamples } from "./examples.ts";
import { evaluateKyb } from "./facts.ts";
import { ownership } from "./ownership.ts";
import { toPercent } from "./frac.ts";

// The names the expert sees for the spec's facts.
export const NAMES: Record<string, string> = {
  excluded: "Excluded entity", nonprofit: "Nonprofit", industry: "Industry", licence_verified: "Licence verified",
  country: "Country", entity_sanctions: "Sanctions screening (business)", entity_adverse_media: "Adverse media (business)",
  residence: "Residence", id_verified: "ID check", sanctions: "Sanctions screening", pep: "Politically exposed",
  adverse_media: "Adverse media", ownership_complete: "Ownership complete", control_person_identified: "Control person identified",
  registry_age_months: "Registry filing age (months)",
};

type PaneHolder = { name: string; type: "person" | "entity" | "pool"; pct: number | string; source: string;
                    verified?: boolean; owners?: PaneHolder[] | null };

// The pane knows people, companies and pools. A holder nobody has named is a pool, whatever the file calls it.
// A trust's share stays unaccounted (no SOP rule covers trusts), so it is a pool too. An excluded entity needs
// no owners (3.1), so it has none, rather than owners nobody has found.
function holders(hs: HolderEvidence[], verified: Set<string>): PaneHolder[] {
  return hs.map((h) => {
    const base = { pct: h.pct, source: h.source };
    if (h.name === null) return { ...base, name: "Unidentified holders", type: "pool" };
    if (h.type === "trust") return { ...base, name: `${h.name} (trust)`, type: "pool" };
    if (h.type === "excluded_entity") return { ...base, name: `${h.name} (excluded entity)`, type: "entity" };
    if (h.type === "unknown") return { ...base, name: h.name, type: "pool" };
    if (h.type === "person") return { ...base, name: h.name, type: "person", verified: verified.has(h.name) };
    return { ...base, name: h.name, type: "entity", owners: h.owners ? holders(h.owners, verified) : null };
  });
}

// The pane's ownership block: the holders as the file lists them, and the share nobody accounts for.
function paneOwnership(file: CaseFile) {
  if (!file.ownership) return undefined;
  const verified = new Set(file.people.filter((p) => p.id_verified?.value === "yes").map((p) => p.name));
  let unaccounted: number | null = null;
  try { unaccounted = toPercent(ownership(file.ownership.holders).unaccounted); } catch { /* a share that isn't a percentage */ }
  return { holders: holders(file.ownership.holders, verified), unaccounted_pct: unaccounted };
}

// Every fact the spec needs, one line each, with whose fact it is. A fact the file doesn't have is unknown.
function paneFacts(file: CaseFile, check: Check) {
  const out: Record<string, unknown>[] = [];
  const push = (key: string, f: Fact | undefined, person?: string) => out.push(f
    ? { key, name: person ? `${NAMES[key]} (${person})` : NAMES[key], value: f.value, source: f.source, how: f.how ?? "lookup", ...(person ? { person } : {}) }
    : { key, name: person ? `${NAMES[key]} (${person})` : NAMES[key], value: "unknown", source: "", how: "lookup", ...(person ? { person } : {}) });
  const e = file.entity;
  push("country", e.country);
  push("excluded", e.excluded);
  push("nonprofit", e.nonprofit);
  push("industry", e.industry);
  push("licence_verified", e.licence_verified);
  push("entity_sanctions", e.screening?.sanctions);
  push("entity_adverse_media", e.screening?.adverse_media);
  if (e.registry_filed) out.push({ key: "registry_filed", name: "Latest registry filing", value: e.registry_filed.value, source: e.registry_filed.source, how: e.registry_filed.how ?? "lookup" });
  const cp = file.control_person;
  const role = cp?.reasons.find((r) => r.kind === "role");
  out.push({
    key: "control_person", name: "Control person", how: "judgment",
    value: cp ? (role?.kind === "role" ? `${cp.name}, ${role.title}` : cp.name) : "unknown",
    source: cp?.reasons.map((r) => r.source).join("; ") ?? "",
    // When the reasons don't meet 3.2, say so on the fact itself, not only in the file's problems.
    ...(check.problems.some((p) => p.fact === "control_person") ? { problem: check.problems.find((p) => p.fact === "control_person")!.text } : {}),
  });
  for (const p of file.people) {
    for (const key of ["residence", "id_verified", "sanctions", "pep", "adverse_media"] as const) push(key, p[key], p.name);
  }
  return out;
}

const said = (o: string) => o.replace(/_/g, " ");

// Why the spec gives its outcome, in SOP sentences with section numbers, never rule IDs. A rule that only
// might apply, because a fact is unknown, is told as the unknowns rule (2.2) holding the case back. When the
// file's outcome differs from the spec's, that comes first, so the sentence never seems to explain the wrong one.
export function decidedBy(spec: Spec, file: CaseFile, check: Check, sections = readSop(spec).sections) {
  const sentence = (sop: string, fallback: string) => `${sop}: ${sections.get(sop) ?? fallback}`;
  const fact = (b: string) => { const n = NAMES[b.replace(/ /g, "_")]; return n ? n.charAt(0).toLowerCase() + n.slice(1) : b; };
  const might = check.hits.filter((h) => h.because);
  const unknown = [...new Set(might.flatMap((h) => h.because!.map(fact)))];
  const why = [
    ...check.hits.filter((h) => !h.because).map((h) => sentence(h.sop, h.text)),
    ...(might.length ? [`${spec.unknowns.sop}: ${unknown.join(" and ")} ${unknown.length === 1 ? "is" : "are"} unknown, so the case can't be decided yet. ` +
      `Once known, ${might.map((h) => `${h.sop} could mean ${said(h.then)}`).join(" and ")}.`] : []),
  ];
  const base = why.join(" ") || "No rule stops approval.";
  return file.outcome === check.outcome ? base : `The file says ${said(file.outcome)}, but the spec gives ${said(check.outcome)}. ${base}`;
}

// One case for cases.json.
export function paneCase(spec: Spec, file: CaseFile, check: Check, name: string, expected?: string) {
  return {
    id: file.case_id, name,
    outcome: file.outcome,
    decided_by: decidedBy(spec, file, check),
    missing: check.missing,
    ownership: paneOwnership(file),
    facts: paneFacts(file, check),
    check: { passed: check.passed, problems: check.problems.map((p) => p.text), ...(expected ? { expected } : {}),
             spec_outcome: check.outcome, flags: check.flags, notes: check.notes },
  };
}

export type PaneRun = { spec: Spec; caseFiles?: string; out: string };

// Builds every file first and writes them only at the end, so a run that fails partway leaves the last good
// run in place, with a status that says what went wrong.
export async function writePane({ spec, caseFiles = join(ROOT, "packs/kyb/fixtures/case-files"), out }: PaneRun) {
  try {
    const previous = readPrevious(out);

    // 1. Rules: Z3's checks on the SOP itself.
    writeStatus(out, { stage: 1, state: "working", activity: `Checking every possible case against the ${spec.rules.length} rules…` });
    const findings = await checkSop(spec);
    const { formulas } = await ruleFormulas(spec);
    const specOut = paneSpec(spec, findings, formulas, previous, NAMES);

    // 2. Cases: each case file's evidence and outcome, against the documents it cites. A fixture names its
    // example's folder; any other case file's documents sit beside it.
    let names: string[];
    try { names = readdirSync(caseFiles).filter((n) => n.endsWith(".json")).sort(); } catch {
      throw new PaneError(`There's no folder of case files at ${caseFiles}.`);
    }
    const truth = new Map(loadExamples().map((ex) => [ex.dir, ex]));
    const cases: ReturnType<typeof paneCase>[] = [];
    for (const [i, n] of names.entries()) {
      writeStatus(out, { stage: 2, state: "working", activity: "Checking each case file's evidence and outcome…", progress: [i, names.length] });
      let file: CaseFile & { dir?: string };
      try { file = JSON.parse(readFileSync(join(caseFiles, n), "utf8")); } catch {
        throw new PaneError(`The case file ${n} isn't valid JSON.`);
      }
      if (!file?.case_id || !file.entity || !Array.isArray(file.people)) throw new PaneError(`${n} isn't a KYB case file.`);
      const docs = file.dir ? join(ROOT, "cases/examples", file.dir) : dirname(join(caseFiles, n));
      const check = checkCase(spec, file, new Documents(docs));
      const ex = file.dir ? truth.get(file.dir) : undefined;
      cases.push(paneCase(spec, file, check, ex?.name ?? file.entity.name, ex ? evaluateKyb(spec, ex.facts).outcome : undefined));
    }

    writeFile(out, "cases.json", { skill_version: null, cases });
    writeFile(out, "spec.json", specOut);
    const open = specOut.findings.filter((f) => !f.answer).length;
    const failed = cases.filter((c) => !c.check.passed).length, flagged = cases.filter((c) => c.check.flags.length).length;
    writeStatus(out, {
      stage: 2, state: open || failed || flagged ? "needs_review" : "done",
      activity: `${open} of ${findings.length} ${findings.length === 1 ? "finding" : "findings"} on the rules need an answer; ` +
        `${cases.length - failed} of ${cases.length} case files pass` + (flagged ? `, and ${flagged} have something for a person to check.` : "."),
    });
    return { findings: specOut.findings, cases };
  } catch (e) {
    writeStatus(out, { stage: 1, state: "failed", activity: e instanceof PaneError ? e.message : `Resolve stopped: ${(e as Error).message}` });
    throw e;
  }
}
