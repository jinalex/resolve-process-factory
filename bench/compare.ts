// Reads the recorded runs and compares agentic review with Resolve.
//   node bench/compare.ts [--cases 60] [--runs bench/runs/main] [--json bench/results/main.json]
// The answer key is the approved spec: Resolve's outcome on the full facts, with the people the SOP asks about identified. So "agrees" means agrees with the
// policy owner's approved reading of the SOP, not ground truth; the planted problems are where a reader could
// reasonably differ, and they are reported on their own.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../core/load.ts";
import { diffSpecs } from "../core/sop-checks.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
import { evaluateIdentified } from "../packs/kyb/facts.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { type RunRecord, promptSetup } from "../runner/agent.ts";
import { generateCases } from "./cases.ts";
import { dollars } from "./prices.ts";
import { loadChanges } from "./changes.ts";
import { citations, flips, majority } from "./score.ts";

const { values: a } = parseArgs({ options: {
  cases: { type: "string", default: "60" }, runs: { type: "string", default: "bench/runs/opus-5-5" }, json: { type: "string" },
} });
type Rec = RunRecord & { variant: string; rep: number };
const runsDir = resolve(ROOT, a.runs!);
const loadAll = (variant: string): Rec[] => {
  const dir = join(runsDir, variant);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))) : [];
};

const spec = kybSpec();
const cases = generateCases(Number(a.cases));
const changes = loadChanges();
const key = (s: typeof spec) => new Map(cases.map((c) => { const r = evaluateIdentified(s, c.facts); return [c.case_id, { outcome: r.outcome, sops: r.decided_by.map((h) => h.sop) }]; }));
const t0 = performance.now();
const truth = key(spec);
const resolveMs = performance.now() - t0;

// Only runs on the cases generated here count (a run recorded with more cases, or by another generator, is left
// out), and only runs whose prompt hash matches the SOP and prompt they are scored under. Runs recorded before
// runs carried the hash are counted and reported.
const sopOf = new Map([["base", readFileSync(join(ROOT, "sop/kyb_sop.md"), "utf8")], ...changes.map((c) => [c.key, c.sop] as [string, string])]);
let unhashed = 0;
const load = (variant: string): Rec[] => {
  const all = loadAll(variant), known = all.filter((r) => truth.has(r.case_id));
  if (known.length < all.length) console.error(`${variant}: ${all.length - known.length} runs on cases not generated here, left out`);
  const byCase = new Map(cases.map((c) => [c.case_id, c]));
  const same = known.filter((r) => r.prompt_sha256 === undefined ||
    r.prompt_sha256 === promptSetup(new KybWorld(r.case_id, byCase.get(r.case_id)!.facts, spec), r.arm, r.level, sopOf.get(variant)!).sha256);
  if (same.length < known.length) console.error(`${variant}: ${known.length - same.length} runs recorded under another SOP or prompt, left out`);
  unhashed += same.filter((r) => r.prompt_sha256 === undefined).length;
  return same;
};
const base = load("base");
const allFacts = base.filter((r) => r.level === "facts" && r.arm === "agentic");
// A run that ended without a decision (turn limit, refusal) is counted on its own, never as a disagreement.
const decided = (r: Rec) => r.outcome !== null;
const facts = allFacts.filter(decided);
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
const lines: string[] = [];
const say = (s = "") => lines.push(s);
const json: Record<string, unknown> = { runs: a.runs, cases: cases.length, model: facts[0]?.model };

// 1. Agreement with the approved spec, decision only.
const agree = facts.filter((r) => r.outcome === truth.get(r.case_id)?.outcome);
say(`# Agentic review vs Resolve`);
say();
say(`${cases.length} synthetic KYB cases (bench/cases.ts), model ${facts[0]?.model ?? "-"}, effort ${facts[0]?.effort ?? "-"}. Answer key: the approved spec.`);
say();
say(`## Decision only: same facts, SOP as written`);
say();
say(`| | Agentic review | Resolve |`);
say(`| --- | --- | --- |`);
say(`| Agrees with the approved spec | ${agree.length}/${facts.length} runs (${pct(agree.length, facts.length)}) | ${cases.length}/${cases.length} (by construction: it is the spec) |`);
const byCase = new Map<string, Rec[]>();
for (const r of facts) byCase.set(r.case_id, [...(byCase.get(r.case_id) ?? []), r]);
const repeated = [...byCase.values()].filter((rs) => rs.length > 1);
const unstable = repeated.filter((rs) => new Set(rs.map((r) => r.outcome)).size > 1);
say(`| Ended without a decision | ${allFacts.length - facts.length}/${allFacts.length} runs | 0 |`);
say(`| Same case, same SOP, different outcome | ${unstable.length}/${repeated.length} cases | 0 (deterministic) |`);
const cites = citations(facts, truth);
say(`| Cites a section that decides the outcome (cases a rule decides) | ${cites.cited}/${cites.scored} (${pct(cites.cited, cites.scored)}) | every outcome a rule decides names its rule ID, SOP section and sentence |`);
say(`| Time per case | ${(mean(facts.map((r) => r.ms)) / 1000).toFixed(1)} s | ${(resolveMs / cases.length).toFixed(2)} ms |`);
say(`| Cost per case | $${mean(facts.map(dollars)).toFixed(3)} | $0 |`);
say();
// Where they disagree, by the section that decides the case under the approved spec.
const wrong = facts.filter((r) => r.outcome !== truth.get(r.case_id)?.outcome);
const bySection = new Map<string, string[]>();
for (const r of wrong) {
  const t = truth.get(r.case_id)!; // every run left is on a generated case
  const k = t.sops.join("+") || "none";
  bySection.set(k, [...(bySection.get(k) ?? []), `${r.case_id} ${r.outcome} (spec: ${t.outcome})`]);
}
if (wrong.length) {
  say(`Disagreements, by the section that decides the case under the approved spec:`);
  say();
  for (const [k, v] of [...bySection].sort((x, y) => y[1].length - x[1].length)) say(`- ${k}: ${v.length} (${[...new Set(v)].slice(0, 6).join("; ")}${v.length > 6 ? "; ..." : ""})`);
  say();
}
say(`An approval no rule stops, and an incomplete case, have no deciding section, so their ${cites.no_section} runs aren't scored for citations.`);
say();
json.decision = { runs: facts.length, undecided: allFacts.length - facts.length, agree: agree.length, unstable: unstable.length, repeated: repeated.length,
  cites: cites.cited, cites_scored: cites.scored, cites_no_section: cites.no_section,
  agentic_s: mean(facts.map((r) => r.ms)) / 1000, agentic_usd: mean(facts.map(dollars)), resolve_ms: resolveMs / cases.length,
  disagreements: Object.fromEntries([...bySection].map(([k, v]) => [k, v])) };

// 2. SOP changes: which past cases flip.
say(`## When the SOP changes: which past cases flip`);
say();
// The agent's usual outcome before a change: the majority of its runs under the SOP as written.
const usual = new Map([...byCase].flatMap(([id, rs]) => { const m = majority(rs.map((r) => r.outcome!)); return m ? [[id, m] as [string, string]] : []; }));
say(`Agentic review reruns every case under the changed SOP and is compared with its usual outcome under the old one (the majority of its ${Math.max(0, ...[...byCase.values()].map((rs) => rs.length))} runs; ${byCase.size - usual.size} cases without a majority are left out). Resolve reruns the evaluator on every case under the changed spec, and Z3 compares the two specs on every case shape with up to two items in each list.`);
say();
say(`| Change | Flips under the spec | Resolve: time | Z3: outcome changes found, time | Agentic: moved to the new outcome | moved, to a wrong outcome | flips the change doesn't explain | missed | already on the new outcome | Agentic: time, cost to rerun |`);
say(`| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
const changeJson: unknown[] = [];
for (const ch of changes) {
  const t1 = performance.now();
  const after = key(ch.spec);
  const ms = performance.now() - t1;
  const z0 = performance.now();
  const patterns = (await diffSpecs(spec, ch.spec)).length;
  const zms = performance.now() - z0;
  const real = cases.filter((c) => truth.get(c.case_id)!.outcome !== after.get(c.case_id)!.outcome).map((c) => c.case_id);
  const allRuns = load(ch.key).filter((r) => r.level === "facts" && r.arm === "agentic");
  // Only decided runs on cases with a usual outcome before are compared.
  const runs = allRuns.filter((r) => decided(r) && usual.has(r.case_id)) as (Rec & { outcome: string })[];
  const f = flips(usual, runs, truth, after);
  const n = (xs: string[]) => (runs.length ? String(xs.length) : "-");
  say(`| ${ch.title} | ${real.length} | ${ms.toFixed(0)} ms | ${patterns}, ${(zms / 1000).toFixed(1)} s | ${n(f.right)} | ${n(f.wrong)} | ${n(f.unexplained)} | ${n(f.missed)} | ${n(f.already)} | ${allRuns.length ? `${(sum(allRuns.map((r) => r.ms)) / 1000 / 60).toFixed(1)} min of model time, $${sum(allRuns.map(dollars)).toFixed(2)}` : "-"}${allRuns.length > runs.length ? ` (${allRuns.length - runs.length} runs without a decision or a usual outcome)` : ""} |`);
  changeJson.push({ key: ch.key, title: ch.title, why: ch.why, real, resolve_ms: ms, z3_changes_found: patterns, z3_slots: 2, z3_ms: zms, runs: allRuns.length, compared: runs.length,
    ...f, agentic_minutes: sum(allRuns.map((r) => r.ms)) / 60000, agentic_usd: sum(allRuns.map(dollars)) });
}
json.changes = changeJson;
say();

// 3. End to end: both arms gather the evidence themselves.
const e2e = (arm: string) => base.filter((r) => r.level === "e2e" && r.arm === arm);
const [ag, rs] = [e2e("agentic"), e2e("resolve")];
if (ag.length || rs.length) {
  say(`## End to end: the agent gathers the evidence, same mock for both arms`);
  say();
  say(`| | Agentic review | Agentic review + Resolve |`);
  say(`| --- | --- | --- |`);
  const row = (label: string, f: (rs: Rec[]) => string) => say(`| ${label} | ${f(ag)} | ${f(rs)} |`);
  row("Cases", (x) => String(x.length));
  row("Agrees with the approved spec on the full facts", (x) => { const n = x.filter((r) => r.outcome === truth.get(r.case_id)?.outcome).length; return `${n}/${x.length} (${pct(n, x.length)})`; });
  row("Approved with a fact still missing or wrong", (x) => String(x.filter((r) => r.outcome === "approve" && truth.get(r.case_id)?.outcome !== "approve").length));
  row("Evidence requests per case", (x) => mean(x.map((r) => r.evidence_requests)).toFixed(1));
  row("Trips to the evidence system per case", (x) => mean(x.map((r) => r.evidence_calls)).toFixed(1));
  row("Resolve checks per case", (x) => mean(x.map((r) => r.resolve_checks)).toFixed(1));
  row("Model turns per case", (x) => mean(x.map((r) => r.turns)).toFixed(1));
  row("Time per case", (x) => `${(mean(x.map((r) => r.ms)) / 1000).toFixed(1)} s`);
  row("Cost per case", (x) => `$${mean(x.map(dollars)).toFixed(3)}`);
  say();
  // Resolve's outcome again, from each run's evidence log under today's rules and mock: a changed check shows here.
  const byId = new Map(cases.map((c) => [c.case_id, c]));
  const same = rs.filter((r) => {
    const w = new KybWorld(r.case_id, byId.get(r.case_id)!.facts, spec);
    w.evidence.log.push(...((r as Rec & { evidence_log?: [] }).evidence_log ?? []));
    return r.outcome === null || w.check().outcome === r.outcome;
  });
  say(`Resolve's outcome, worked out again from each run's evidence log under the current rules, matches the recorded one in ${same.length}/${rs.length} runs.`);
  say();
  json.e2e_replay = { same: same.length, runs: rs.length };
  json.e2e = Object.fromEntries([["agentic", ag], ["resolve", rs]].map(([k, x]) => [k as string, (x as Rec[]).map((r) => ({ case_id: r.case_id, outcome: r.outcome, truth: truth.get(r.case_id)?.outcome, requests: r.evidence_requests, calls: r.evidence_calls, checks: r.resolve_checks, turns: r.turns, ms: r.ms, usd: dollars(r) }))]));
}

if (unhashed) say(`${unhashed} runs were recorded before runs carried a hash of their prompt; they are counted as recorded.`);
console.log(lines.join("\n"));
if (a.json) { mkdirSync(dirname(join(ROOT, a.json)), { recursive: true }); writeFileSync(join(ROOT, a.json), JSON.stringify(json, null, 1)); }
