// Loads the KYB example cases. Each truth.json holds raw facts only; outcomes are always computed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "../../core/load.ts";
import type { Spec } from "../../core/spec.ts";
import type { KybFacts } from "./facts.ts";

export type Example = { case_id: string; name: string; dir: string; facts: KybFacts; expected_findings: string[] };

export const kybSpec = (file = "spec/kyb-v1.json"): Spec => loadSpec(file);

export function loadExamples(dir = "cases/examples"): Example[] {
  const base = join(ROOT, dir);
  return readdirSync(base).filter((d) => statSync(join(base, d)).isDirectory()).sort().map((d) => {
    const t = JSON.parse(readFileSync(join(base, d, "truth.json"), "utf8"));
    return { case_id: t.case_id, name: t.name, dir: d, facts: { review_date: t.review_date, ...t.true_facts }, expected_findings: t.expected_findings ?? [] };
  }).sort((a, b) => a.case_id.localeCompare(b.case_id));
}
