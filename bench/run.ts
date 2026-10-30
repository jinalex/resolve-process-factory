// Runs agentic review on the synthetic cases and records every run, for bench/compare.ts.
//   node bench/run.ts [--cases 60] [--reps 3] [--e2e 20] [--e2e-reps 1] [--only facts|e2e] [--arm agentic|resolve] [--notes file]
//                     [--concurrency 4] [--out bench/runs/main]
// Decision only ("facts"): agentic review on every case, --reps times under the SOP as written (consistency) and
// once under each changed SOP. End to end ("e2e"): both arms on the first --e2e cases under the SOP as written,
// --e2e-reps times. --only runs one level, e.g. for a model ladder that is scored end to end only. With --only e2e,
// --arm runs one arm and --notes hands the agent a version of its review notes, for an improvement round
// (bench/improve.ts): --only e2e --arm resolve --e2e 60 --e2e-reps 3 --notes <file>.
// Resolve at the facts level needs no model and is worked out in compare.ts. A run already on disk is skipped,
// so an interrupted run resumes, but only if it was recorded under the same model, effort and prompt. A record is
// written whole or not at all, and one that can't be read is run again.
// Needs RESOLVE_ANTHROPIC_API_KEY.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT } from "../core/load.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { type Arm, type Level, type RunRecord, promptSetup, runCase } from "../runner/agent.ts";
import { caseFingerprint, generateCases } from "./cases.ts";
import { loadChanges } from "./changes.ts";

const { values: a } = parseArgs({ options: {
  cases: { type: "string", default: "60" }, reps: { type: "string", default: "3" }, e2e: { type: "string", default: "20" }, "e2e-reps": { type: "string", default: "1" },
  only: { type: "string" }, arm: { type: "string" }, notes: { type: "string" },
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
if (a.arm !== undefined && a.arm !== "agentic" && a.arm !== "resolve") throw new Error("--arm must be agentic or resolve");
// Notes and one arm are for improvement rounds, which are end to end only; a facts run under notes would be
// dropped by bench/compare.ts, which scores the SOP as written.
if ((a.arm !== undefined || a.notes !== undefined) && a.only !== "e2e") throw new Error("--arm and --notes need --only e2e");
const notesText = a.notes ? readFileSync(resolve(ROOT, a.notes), "utf8") : undefined;
const notes = notesText?.trim() ? notesText : undefined; // whitespace only is no notes, as bench/improve.ts reads it
const out = resolve(ROOT, a.out!);

type Job = { variant: (typeof variants)[number]; c: (typeof cases)[number]; arm: Arm; level: Level; rep: number };
const jobs: Job[] = [];
if (a.only !== "e2e") {
  for (const c of cases) for (let rep = 1; rep <= Number(a.reps); rep++) jobs.push({ variant: variants[0], c, arm: "agentic", level: "facts", rep });
  for (const v of variants.slice(1)) for (const c of cases) jobs.push({ variant: v, c, arm: "agentic", level: "facts", rep: 1 });
}
if (a.only !== "facts") for (const c of cases.slice(0, Number(a.e2e))) for (let rep = 1; rep <= Number(a["e2e-reps"]); rep++)
  for (const arm of (a.arm ? [a.arm] : ["agentic", "resolve"]) as Arm[]) jobs.push({ variant: variants[0], c, arm, level: "e2e", rep });

const path = (j: Job) => join(out, j.variant.key, `${j.c.case_id}-${j.arm}-${j.level}-${j.rep}.json`);
const read = (j: Job): RunRecord | null => {
  try { return JSON.parse(readFileSync(path(j), "utf8")) as RunRecord; } catch { return null; }
};
const onDisk = (j: Job) => existsSync(path(j)) && read(j) !== null;
// A run on disk from another model, effort or prompt (SOP, instructions, tools) would be mixed in silently.
const clash = jobs.filter(onDisk).filter((j) => {
  const r = read(j)!;
  const sha = promptSetup(new KybWorld(j.c.case_id, j.c.facts, j.variant.spec), j.arm, j.level, j.variant.sop, notes).sha256;
  return r.model !== a.model || r.effort !== effort || (r.prompt_sha256 !== undefined && r.prompt_sha256 !== sha);
});
if (clash.length) throw new Error(`${clash.length} runs in ${a.out} were recorded under another model, effort or prompt (e.g. ${path(clash[0])}); use another --out.`);
const todo = jobs.filter((j) => !onDisk(j));
console.log(`${jobs.length} runs, ${jobs.length - todo.length} already on disk, ${todo.length} to go.`);

let done = 0, failed = 0;
async function worker() {
  for (let j = todo.shift(); j; j = todo.shift()) {
    const world = new KybWorld(j.c.case_id, j.c.facts, j.variant.spec);
    try {
      const rec = await runCase(client, world, j.arm, j.level, { model: a.model!, effort, maxTurns: 30, sop: j.variant.sop, skill: notes });
      mkdirSync(join(out, j.variant.key), { recursive: true });
      const record = { ...rec, variant: j.variant.key, rep: j.rep, case_sha256: caseFingerprint(j.c.facts, j.variant.spec), evidence_log: world.evidence.log };
      writeFileSync(`${path(j)}.tmp`, JSON.stringify(record, null, 1));
      renameSync(`${path(j)}.tmp`, path(j));
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
