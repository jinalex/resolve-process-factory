// Loads the KYB example cases. Each truth.json holds raw facts only; outcomes are always computed.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "../../core/load.ts";
import type { Condition, Spec } from "../../core/spec.ts";
import type { PastCase } from "../../core/impact.ts";
import { type KybFacts, toCase } from "./facts.ts";
import { DEFAULT_SPEC } from "../../core/current-spec.ts";

export type Example = { case_id: string; name: string; dir: string; facts: KybFacts };

export const kybSpec = (file = DEFAULT_SPEC): Spec => loadSpec(file);

export function loadExamples(): Example[] {
  const base = join(ROOT, "packs/kyb/cases/examples");
  return readdirSync(base).filter((d) => statSync(join(base, d)).isDirectory()).sort().map((d) => {
    const t = JSON.parse(readFileSync(join(base, d, "truth.json"), "utf8"));
    const facts = { review_date: t.review_date, ...t.true_facts };
    return { case_id: t.case_id, name: t.name, dir: d, facts };
  }).sort((a, b) => a.case_id.localeCompare(b.case_id));
}

// The examples as past cases, for what an answer would change. The examples are made up, so no team decided
// them: the decision is null, and a flip is shown without a past decision to compare with.
export const pastCases = (): PastCase[] =>
  loadExamples().map((e) => ({ id: e.case_id, name: e.name, decision: null, case: toCase(e.facts).case }));

// The 3.3 condition in the spec's who-counts rule that adds an owner's share to the share nobody is identified
// for, so a test can move its 25% bar.
export function shareBar(spec: Spec): { at_least: number } {
  const find = (c: Condition): Condition | undefined =>
    "sum" in c ? c : "any" in c ? c.any.map(find).find(Boolean) : "all" in c ? c.all.map(find).find(Boolean) : undefined;
  return find(spec.collections.find((x) => x.key === "people")!.counts_when!) as { at_least: number };
}
