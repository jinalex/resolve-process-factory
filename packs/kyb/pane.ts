// Runs Resolve's checks on a KYB spec and its case files and writes what the pane reads into `.resolve/`
// (docs/INTERFACE.md): Z3's findings on the SOP into spec.json, each case file and its check into cases.json,
// and each step into status.json, so the pane's stage strip follows the run.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { paneSpec, readFile, writeFile, writeStatus } from "../../core/pane.ts";
import { ruleFormulas } from "../../core/rule-formulas.ts";
import { checkSop } from "../../core/sop-checks.ts";
import type { Spec } from "../../core/spec.ts";
import { ROOT } from "../../core/load.ts";
import { type CaseFile, type Check, type Fact, type HolderEvidence, Documents, checkCase } from "./case-file.ts";
import { loadExamples } from "./examples.ts";
import { evaluateKyb } from "./facts.ts";
import { ownership } from "./ownership.ts";
import { toPercent } from "./frac.ts";

type PaneHolder = { name: string; type: "person" | "entity" | "pool"; pct: number | string; source: string; owners?: PaneHolder[] | null };

const TYPE: Record<HolderEvidence["type"], PaneHolder["type"]> = {
  person: "person", entity: "entity", excluded_entity: "entity", trust: "entity", unknown: "pool",
};

function holders(hs: HolderEvidence[]): PaneHolder[] {
  return hs.map((h) => ({
    name: h.name ?? "Unidentified holders", type: TYPE[h.type], pct: h.pct, source: h.source,
    ...(h.type === "person" || h.type === "unknown" ? {} : { owners: h.owners ? holders(h.owners) : null }),
  }));
}

// The pane's ownership block: the holders as the file lists them, and the share nobody accounts for.
function paneOwnership(file: CaseFile) {
  if (!file.ownership) return undefined;
  let unaccounted: number | null = null;
  try { unaccounted = toPercent(ownership(file.ownership.holders).unaccounted); } catch { /* a share that isn't a percentage */ }
  return { holders: holders(file.ownership.holders), unaccounted_pct: unaccounted };
}

// Every fact in the file, one line each, with whose fact it is.
function paneFacts(file: CaseFile) {
  const out: Record<string, unknown>[] = [];
  const push = (key: string, name: string, f: Fact | undefined) => {
    if (!f) return;
    out.push({ key, name, value: f.value, source: f.source, how: f.how ?? "lookup" });
  };
  const e = file.entity;
  push("country", "Country", e.country);
  push("excluded", "Excluded entity", e.excluded);
  push("nonprofit", "Nonprofit", e.nonprofit);
  push("industry", "Industry", e.industry);
  push("licence_verified", "Licence verified", e.licence_verified);
  push("registry_filed", "Latest registry filing", e.registry_filed);
  push("entity_sanctions", "Sanctions screening", e.screening?.sanctions);
  push("entity_adverse_media", "Adverse media", e.screening?.adverse_media);
  if (file.control_person) {
    const r = file.control_person.reasons[0];
    out.push({ key: "control_person", name: "Control person", value: file.control_person.name, source: r?.source ?? "", how: "judgment" });
  }
  for (const p of file.people) {
    push("residence", `Residence (${p.name})`, p.residence);
    push("nationality", `Nationality (${p.name})`, p.nationality);
    push("id_verified", `ID check (${p.name})`, p.id_verified);
    push("sanctions", `Sanctions screening (${p.name})`, p.sanctions);
    push("pep", `Politically exposed (${p.name})`, p.pep);
    push("adverse_media", `Adverse media (${p.name})`, p.adverse_media);
  }
  return out;
}

// One case for cases.json. `decided_by` is the SOP sentence behind the outcome, never a rule ID.
export function paneCase(spec: Spec, file: CaseFile, check: Check, name: string, expected?: string) {
  const sentence = new Map(spec.rules.map((r) => [r.id, `${r.sop}: ${r.text}`]));
  return {
    id: file.case_id, name,
    outcome: file.outcome,
    decided_by: check.decided_by.map((id) => sentence.get(id) ?? id).join(" ") || "No rule stops approval.",
    missing: check.missing,
    ownership: paneOwnership(file),
    facts: paneFacts(file),
    check: { passed: check.passed, problems: check.problems.map((p) => p.text), ...(expected ? { expected } : {}),
             spec_outcome: check.outcome, flags: check.flags, notes: check.notes },
  };
}

export type PaneRun = { spec: Spec; caseFiles?: string; out: string };

export async function writePane({ spec, caseFiles = join(ROOT, "packs/kyb/fixtures/case-files"), out }: PaneRun) {
  // 1. Rules: Z3's checks on the SOP itself.
  writeStatus(out, { stage: 1, state: "working", activity: `Checking every possible case against the ${spec.rules.length} rules…` });
  const findings = await checkSop(spec);
  const { formulas } = await ruleFormulas(spec);
  const previous = readFile<Record<string, unknown>>(out, "spec.json");
  writeFile(out, "spec.json", paneSpec(spec, findings, formulas, previous?.version === spec.version ? previous : null));

  // 2. Cases: each case file's evidence and outcome, against the documents it cites.
  const names = readdirSync(caseFiles).filter((n) => n.endsWith(".json")).sort();
  const truth = new Map(loadExamples().map((ex) => [ex.dir, ex]));
  const cases: ReturnType<typeof paneCase>[] = [];
  for (const [i, n] of names.entries()) {
    writeStatus(out, { stage: 2, state: "working", activity: "Checking each case file's evidence and outcome…", progress: [i, names.length] });
    const file = JSON.parse(readFileSync(join(caseFiles, n), "utf8")) as CaseFile & { dir: string };
    const check = checkCase(spec, file, new Documents(join(ROOT, "cases/examples", file.dir)));
    const ex = truth.get(file.dir);
    cases.push(paneCase(spec, file, check, ex?.name ?? file.entity.name, ex ? evaluateKyb(spec, ex.facts).outcome : undefined));
  }
  writeFile(out, "cases.json", { skill_version: null, cases });

  const open = findings.length, failed = cases.filter((c) => !c.check.passed).length;
  writeStatus(out, {
    stage: 2, state: open || failed ? "needs_review" : "done",
    activity: `${open} ${open === 1 ? "question" : "questions"} on the rules; ${cases.length - failed} of ${cases.length} case files pass.`,
  });
  return { findings, cases };
}
