// Reads the recorded runs and compares agentic review with Resolve.
//   node bench/compare.ts [--cases 60] [--runs bench/runs/main] [--json bench/results/main.json]
// The answer key is the approved spec: Resolve's outcome on the full facts. So "agrees" means agrees with the
// policy owner's approved reading of the SOP, not ground truth; the planted problems are where a reader could
// reasonably differ, and they are reported on their own.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../core/load.ts";
import { diffSpecs } from "../core/sop-checks.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
import { evaluateKyb } from "../packs/kyb/facts.ts";
import type { RunRecord } from "../runner/agent.ts";
import { generateCases } from "./cases.ts";
import { loadChanges } from "./changes.ts";

// Per million tokens, Anthropic API list prices (October 2026). Cache writes are 1.25x input.
const PRICES: Record<string, { input: number; output: number; cache_read: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cache_read: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2 },
};
export const dollars = (r: RunRecord) => {
  const p = PRICES[r.model];
  if (!p) return 0;
  const u = r.usage;
  return (u.input * p.input + u.cache_write * p.input * 1.25 + u.cache_read * p.cache_read + u.output * p.output) / 1e6;
};

const { values: a } = parseArgs({ options: {
  cases: { type: "string", default: "60" }, runs: { type: "string", default: "bench/runs/main" }, json: { type: "string" },
} });
type Rec = RunRecord & { variant: string; rep: number };
const runsDir = join(ROOT, a.runs!);
const load = (variant: string): Rec[] => {
  const dir = join(runsDir, variant);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8"))) : [];
};

const spec = kybSpec();
const cases = generateCases(Number(a.cases));
const changes = loadChanges();
const key = (s: typeof spec) => new Map(cases.map((c) => { const r = evaluateKyb(s, c.facts); return [c.case_id, { outcome: r.outcome, sops: r.decided_by.map((h) => h.sop) }]; }));
const t0 = performance.now();
const truth = key(spec);
const resolveMs = performance.now() - t0;

const base = load("base");
const facts = base.filter((r) => r.level === "facts" && r.arm === "agentic");
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
say(`| Same case, same SOP, different outcome | ${unstable.length}/${repeated.length} cases | 0 (deterministic) |`);
const cites = facts.filter((r) => (truth.get(r.case_id)?.sops ?? []).some((s) => r.agent?.sop_sections?.includes(s)));
say(`| Cites a section that decides the outcome | ${cites.length}/${facts.length} (${pct(cites.length, facts.length)}) | every outcome names its rule ID, SOP section and sentence |`);
say(`| Time per case | ${(mean(facts.map((r) => r.ms)) / 1000).toFixed(1)} s | ${(resolveMs / cases.length).toFixed(2)} ms |`);
say(`| Cost per case | $${mean(facts.map(dollars)).toFixed(3)} | $0 |`);
say();
// Where they disagree, by the section that decides the case under the approved spec.
const wrong = facts.filter((r) => r.outcome !== truth.get(r.case_id)?.outcome);
const bySection = new Map<string, string[]>();
for (const r of wrong) { const k = truth.get(r.case_id)!.sops.join("+") || "none"; bySection.set(k, [...(bySection.get(k) ?? []), `${r.case_id} ${r.outcome} (spec: ${truth.get(r.case_id)!.outcome})`]); }
if (wrong.length) {
  say(`Disagreements, by the section that decides the case under the approved spec:`);
  say();
  for (const [k, v] of [...bySection].sort((x, y) => y[1].length - x[1].length)) say(`- ${k}: ${v.length} (${[...new Set(v)].slice(0, 6).join("; ")}${v.length > 6 ? "; ..." : ""})`);
  say();
}
json.decision = { runs: facts.length, agree: agree.length, unstable: unstable.length, repeated: repeated.length, cites: cites.length,
  agentic_s: mean(facts.map((r) => r.ms)) / 1000, agentic_usd: mean(facts.map(dollars)), resolve_ms: resolveMs / cases.length,
  disagreements: Object.fromEntries([...bySection].map(([k, v]) => [k, v])) };

// 2. SOP changes: which past cases flip.
say(`## When the SOP changes: which past cases flip`);
say();
say(`Agentic review reruns every case under the changed SOP and compares with its own first run under the old one. Resolve reruns the evaluator on every case under the changed spec, and Z3 compares the two specs for any case, past or future.`);
say();
say(`| Change | Flips under the spec | Resolve: time | Z3: patterns, time | Agentic: flips | right flips | flips the change doesn't explain | missed | Agentic: time, cost to rerun |`);
say(`| --- | --- | --- | --- | --- | --- | --- | --- | --- |`);
const changeJson: unknown[] = [];
for (const ch of changes) {
  const t1 = performance.now();
  const after = key(ch.spec);
  const ms = performance.now() - t1;
  const z0 = performance.now();
  const patterns = (await diffSpecs(spec, ch.spec)).length;
  const zms = performance.now() - z0;
  const real = cases.filter((c) => truth.get(c.case_id)!.outcome !== after.get(c.case_id)!.outcome).map((c) => c.case_id);
  const runs = load(ch.key).filter((r) => r.level === "facts" && r.arm === "agentic");
  const before = new Map(facts.filter((r) => r.rep === 1).map((r) => [r.case_id, r.outcome]));
  const flipped = runs.filter((r) => before.has(r.case_id) && before.get(r.case_id) !== r.outcome);
  const right = flipped.filter((r) => real.includes(r.case_id) && r.outcome === after.get(r.case_id)!.outcome);
  const spurious = flipped.filter((r) => !real.includes(r.case_id));
  const missed = real.filter((id) => !flipped.some((r) => r.case_id === id) && runs.some((r) => r.case_id === id));
  say(`| ${ch.title} | ${real.length} | ${ms.toFixed(0)} ms | ${patterns}, ${(zms / 1000).toFixed(1)} s | ${runs.length ? flipped.length : "-"} | ${runs.length ? right.length : "-"} | ${runs.length ? spurious.length : "-"} | ${runs.length ? missed.length : "-"} | ${runs.length ? `${(sum(runs.map((r) => r.ms)) / 1000 / 60).toFixed(1)} min of model time, $${sum(runs.map(dollars)).toFixed(2)}` : "-"} |`);
  changeJson.push({ key: ch.key, title: ch.title, why: ch.why, real, resolve_ms: ms, z3_patterns: patterns, z3_ms: zms, runs: runs.length,
    flipped: flipped.map((r) => r.case_id), right: right.map((r) => r.case_id), spurious: spurious.map((r) => r.case_id), missed,
    agentic_minutes: sum(runs.map((r) => r.ms)) / 60000, agentic_usd: sum(runs.map(dollars)) });
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
  json.e2e = Object.fromEntries([["agentic", ag], ["resolve", rs]].map(([k, x]) => [k as string, (x as Rec[]).map((r) => ({ case_id: r.case_id, outcome: r.outcome, truth: truth.get(r.case_id)?.outcome, requests: r.evidence_requests, calls: r.evidence_calls, checks: r.resolve_checks, turns: r.turns, ms: r.ms, usd: dollars(r) }))]));
}

console.log(lines.join("\n"));
if (a.json) { mkdirSync(dirname(join(ROOT, a.json)), { recursive: true }); writeFileSync(join(ROOT, a.json), JSON.stringify(json, null, 1)); }
