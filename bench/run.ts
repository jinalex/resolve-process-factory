// Runs agentic review on the synthetic cases and records every run, for bench/compare.ts.
//   node bench/run.ts [--cases 60] [--reps 3] [--e2e 20] [--e2e-reps 1] [--only facts|e2e] [--concurrency 4] [--out bench/runs/main]
// Decision only ("facts"): agentic review on every case, --reps times under the SOP as written (consistency) and
// once under each changed SOP. End to end ("e2e"): both arms on the first --e2e cases under the SOP as written,
// --e2e-reps times. --only runs one level, e.g. for a model ladder that is scored end to end only.
// Resolve at the facts level needs no model and is worked out in compare.ts. A run already on disk is skipped,
// so an interrupted run resumes, but only if it was recorded under the same model, effort and prompt.
// Needs RESOLVE_ANTHROPIC_API_KEY.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT } from "../core/load.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { type Arm, type Level, type RunRecord, promptSetup, runCase } from "../runner/agent.ts";
import { generateCases } from "./cases.ts";
import { loadChanges } from "./changes.ts";

const { values: a } = parseArgs({ options: {
  cases: { type: "string", default: "60" }, reps: { type: "string", default: "3" }, e2e: { type: "string", default: "20" }, "e2e-reps": { type: "string", default: "1" },
  only: { type: "string" },
  concurrency: { type: "string", default: "4" }, out: { type: "string", default: "bench/runs/main" },
  model: { type: "string", default: "claude-fable-5-1" }, effort: { type: "string", default: "high" },
} });
const efforts = ["low", "medium", "high", "xhigh", "max"] as const;
if (!efforts.includes(a.effort as never)) throw new Error(`--effort must be one of ${efforts.join(", ")}`);
const effort = a.effort as (typeof efforts)[number];
const apiKey = process.env.RESOLVE_ANTHROPIC_API_KEY;
if (!apiKey) throw new Error("Set RESOLVE_ANTHROPIC_API_KEY.");
const client = new Anthropic({ apiKey });
const spec = kybSpec();
const sop = readFileSync(join(ROOT, "sop/kyb_sop.md"), "utf8");
const cases = generateCases(Number(a.cases));
const variants = [{ key: "base", sop, spec }, ...loadChanges().map((c) => ({ key: c.key, sop: c.sop, spec: c.spec }))];
if (a.only !== undefined && a.only !== "facts" && a.only !== "e2e") throw new Error("--only must be facts or e2e");
const out = join(ROOT, a.out!);

type Job = { variant: (typeof variants)[number]; c: (typeof cases)[number]; arm: Arm; level: Level; rep: number };
const jobs: Job[] = [];
if (a.only !== "e2e") {
  for (const c of cases) for (let rep = 1; rep <= Number(a.reps); rep++) jobs.push({ variant: variants[0], c, arm: "agentic", level: "facts", rep });
  for (const v of variants.slice(1)) for (const c of cases) jobs.push({ variant: v, c, arm: "agentic", level: "facts", rep: 1 });
}
if (a.only !== "facts") for (const c of cases.slice(0, Number(a.e2e))) for (let rep = 1; rep <= Number(a["e2e-reps"]); rep++)
  for (const arm of ["agentic", "resolve"] as Arm[]) jobs.push({ variant: variants[0], c, arm, level: "e2e", rep });

const path = (j: Job) => join(out, j.variant.key, `${j.c.case_id}-${j.arm}-${j.level}-${j.rep}.json`);
// A run on disk from another model, effort or prompt (SOP, instructions, tools) would be mixed in silently.
const clash = jobs.filter((j) => existsSync(path(j))).filter((j) => {
  const r = JSON.parse(readFileSync(path(j), "utf8")) as RunRecord;
  const sha = promptSetup(new KybWorld(j.c.case_id, j.c.facts, j.variant.spec), j.arm, j.level, j.variant.sop).sha256;
  return r.model !== a.model || r.effort !== effort || (r.prompt_sha256 !== undefined && r.prompt_sha256 !== sha);
});
if (clash.length) throw new Error(`${clash.length} runs in ${a.out} were recorded under another model, effort or prompt (e.g. ${path(clash[0])}); use another --out.`);
const todo = jobs.filter((j) => !existsSync(path(j)));
console.log(`${jobs.length} runs, ${jobs.length - todo.length} already on disk, ${todo.length} to go.`);

let done = 0, failed = 0;
async function worker() {
  for (let j = todo.shift(); j; j = todo.shift()) {
    const world = new KybWorld(j.c.case_id, j.c.facts, j.variant.spec);
    try {
      const rec = await runCase(client, world, j.arm, j.level, { model: a.model!, effort, maxTurns: 30, sop: j.variant.sop });
      mkdirSync(join(out, j.variant.key), { recursive: true });
      writeFileSync(path(j), JSON.stringify({ ...rec, variant: j.variant.key, rep: j.rep, evidence_log: world.evidence.log }, null, 1));
      done++;
      if (done % 10 === 0) console.log(`${done} done, ${failed} failed`);
    } catch (e) {
      failed++;
      console.error(`${j.variant.key} ${j.c.case_id} ${j.arm}/${j.level} #${j.rep}: ${(e as Error).message}`);
    }
  }
}
await Promise.all(Array.from({ length: Number(a.concurrency) }, worker));
console.log(`Finished: ${done} recorded, ${failed} failed (rerun to retry them).`);
