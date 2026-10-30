// Three SOP changes a policy owner might make, each as the same edit to the SOP's words and to the spec. Agentic
// review reads the edited SOP; Resolve reads the edited spec. Every edit must find its text, so a change can't
// silently do nothing.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "../core/load.ts";
import type { Condition, Spec } from "../core/spec.ts";
import { DEFAULT_SPEC } from "../core/current-spec.ts";

export type Change = { key: string; title: string; why: string; sop: string; spec: Spec };

const replaceOnce = (s: string, from: string, to: string) => {
  const n = s.split(from).length - 1;
  if (n !== 1) throw new Error(`expected "${from}" once in the SOP, found ${n}`);
  return s.replace(from, to);
};

// Every share bar of 25 in a condition (3.3's who-counts rule, the unidentified share, an excluded owner's share).
function moveShareBar(c: Condition, to: number): Condition {
  if ("all" in c) return { all: c.all.map((x) => moveShareBar(x, to)) };
  if ("any" in c) return { any: c.any.map((x) => moveShareBar(x, to)) };
  if ("not" in c) return { not: moveShareBar(c.not, to) };
  if ("at_least" in c && c.at_least === 25) return { ...c, at_least: to } as Condition;
  return c;
}

export function loadChanges(sopFile = "sop/kyb_sop.md", specFile = DEFAULT_SPEC): Change[] {
  const sop = readFileSync(join(ROOT, sopFile), "utf8");
  const base = () => structuredClone(loadSpec(specFile));
  const rule = (s: Spec, id: string) => { const r = s.rules.find((x) => x.id === id); if (!r) throw new Error(`no rule ${id}`); return r; };

  // 1. Owners from 20%, as some regulators and banks require for higher-risk customers.
  const bar = base();
  bar.collections = bar.collections.map((x) => (x.counts_when ? { ...x, counts_when: moveShareBar(x.counts_when, 20) } : x));
  bar.computed = bar.computed.map((x) => (x.sum ? { ...x, sum: x.sum.map((t) => ("where" in t && t.where ? { ...t, where: moveShareBar(t.where, 20) } : t)) } : x));
  rule(bar, "ownership-complete").when = moveShareBar(rule(bar, "ownership-complete").when, 20);
  const s3 = sop.slice(sop.indexOf("3.3."), sop.indexOf("3.4."));
  if ((s3.match(/25%/g) ?? []).length !== 3) throw new Error("3.3 should say 25% three times");

  // 2. Registry filings under 6 months old.
  const fresh = base();
  const reg = rule(fresh, "registry-fresh");
  if (!("at_least" in reg.when) || reg.when.at_least !== 12) throw new Error("registry-fresh should be at least 12 months");
  reg.when = { ...reg.when, at_least: 6 };
  reg.text = reg.text.replace("12 months", "6 months");

  // 3. A pending ID check is unknown, not unverified (the planted problem in 3.4): only a failed check asks for documents.
  const idv = base();
  rule(idv, "id-verified").when = { some: "people", where: { fact: "id_verified", is: "no" } };
  rule(idv, "id-verified").text = "Verify the identity of every identified individual. If an identity check has failed, request documents. A check that has not come back is unknown (2.2).";

  return [
    { key: "owners-20", title: "Owners from 20%", why: "The policy owner lowers the beneficial-ownership bar in 3.3 from 25% to 20%.",
      sop: sop.replace(s3, s3.replaceAll("25%", "20%")), spec: { ...JSON.parse(JSON.stringify(bar).replaceAll("25%", "20%")), version: 2 } },
    { key: "registry-6m", title: "Filings under 6 months", why: "The policy owner tightens 3.5 from 12 months to 6.",
      sop: replaceOnce(sop, "must be less than 12 months old", "must be less than 6 months old"), spec: { ...fresh, version: 2 } },
    { key: "pending-id", title: "A pending ID check is unknown", why: "The policy owner fixes 3.4 so a check that hasn't come back makes the case incomplete instead of asking the customer for documents.",
      sop: replaceOnce(sop, "Verify the identity of every identified individual. If any is unverified, request documents.",
        "Verify the identity of every identified individual. If an identity check has failed, request documents. A check that has not come back is unknown (2.2)."),
      spec: { ...idv, version: 2 } },
  ];
}
