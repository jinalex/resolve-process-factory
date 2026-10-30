// The model ladder: each model end to end, alone and with Resolve, scored against the approved spec.
//   node bench/ladder.ts [--cases 60] [--runs bench/runs/ladder] [--out bench/results/ladder]
// Each folder under --runs holds one model's runs from `bench/run.ts --only e2e`. Writes <out>.md and <out>.json,
// which the lander's chart reads. Runs under another SOP or prompt, or on cases not generated here, are left out.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { ROOT } from "../core/load.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
import { evaluateIdentified } from "../packs/kyb/facts.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { type RunRecord, promptSetup } from "../runner/agent.ts";
import { generateCases } from "./cases.ts";
import { dollars } from "./prices.ts";
import { type Key, rung } from "./score.ts";

const { values: a } = parseArgs({ options: {
  cases: { type: "string", default: "60" }, runs: { type: "string", default: "bench/runs/ladder" }, out: { type: "string", default: "bench/results/ladder" },
} });
const spec = kybSpec();
const sop = readFileSync(join(ROOT, "sop/kyb_sop.md"), "utf8");
const cases = generateCases(Number(a.cases));
const byId = new Map(cases.map((c) => [c.case_id, c]));
const truth = new Map<string, Key>(cases.map((c) => { const r = evaluateIdentified(spec, c.facts); return [c.case_id, { outcome: r.outcome, sops: r.decided_by.map((h) => h.sop) }]; }));
const sha = (r: RunRecord) => promptSetup(new KybWorld(r.case_id, byId.get(r.case_id)!.facts, spec), r.arm, r.level, sop).sha256;

const root = resolve(ROOT, a.runs!);
const rungs = readdirSync(root).filter((d) => existsSync(join(root, d, "base"))).sort().flatMap((dir) => {
  const all = readdirSync(join(root, dir, "base")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(root, dir, "base", f), "utf8")) as RunRecord);
  const runs = all.filter((r) => r.level === "e2e" && byId.has(r.case_id) && r.prompt_sha256 === sha(r));
  if (runs.length < all.length) console.error(`${dir}: ${all.length - runs.length} runs left out (other cases, level, SOP or prompt)`);
  return (["agentic", "resolve"] as const).map((arm) => {
    const x = runs.filter((r) => r.arm === arm);
    return { model: x[0]?.model, effort: x[0]?.effort, arm, ...rung(x.map((r) => ({ case_id: r.case_id, outcome: r.outcome, usd: dollars(r), ms: r.ms })), truth) };
  }).filter((r) => r.runs);
});

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "-");
const commit = execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim();
const lines = [
  `# Model ladder: end to end, alone and with Resolve`,
  ``,
  `${cases.length} synthetic KYB cases (bench/cases.ts), mocked evidence, SOP as written. Each run starts with only the case ID and gathers its own evidence. Answer key: the approved spec on the full facts.`,
  ``,
  `| Model | Effort | Arm | Runs | Agrees with the approved spec | Dangerous approvals | No decision | Cases with more than one outcome | Cost per case | Time per case |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ...rungs.map((r) => `| ${r.model} | ${r.effort} | ${r.arm === "resolve" ? "with Resolve" : "alone"} | ${r.runs} | ${r.correct}/${r.runs} (${pct(r.correct, r.runs)}) | ${r.dangerous_approvals} | ${r.no_decision} | ${r.unstable_cases}/${r.cases} | $${r.usd_per_case.toFixed(4)} | ${r.s_per_case.toFixed(1)} s |`),
  ``,
  `A dangerous approval approves a case the spec would escalate, decline or send back for documents. Cost is at API list prices (bench/prices.ts). With Resolve, the rules decide from the evidence the agent gathered, so a wrong outcome there means the agent stopped gathering too early.`,
];
console.log(lines.join("\n"));
writeFileSync(resolve(ROOT, `${a.out}.md`), lines.join("\n") + "\n");
writeFileSync(resolve(ROOT, `${a.out}.json`), JSON.stringify({ cases: cases.length, commit, generated: new Date().toISOString().slice(0, 10), rungs }, null, 1) + "\n");
