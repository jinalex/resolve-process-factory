// Runs the case runner on KYB example cases and records each run.
//   node runner/run.ts --arm agentic|resolve --level facts|e2e [--case EX-1,EX-5] [--n 1] [--model ...] [--effort high]
// Writes one JSON per run into runs/<date>/ (or --out). Needs RESOLVE_ANTHROPIC_API_KEY.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { ROOT } from "../core/load.ts";
import { kybSpec, loadExamples } from "../packs/kyb/examples.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { type Arm, type Level, runCase, resolveOnly } from "./agent.ts";

const { values: a } = parseArgs({ options: {
  arm: { type: "string", default: "agentic" }, level: { type: "string", default: "e2e" }, case: { type: "string" },
  n: { type: "string", default: "1" }, model: { type: "string", default: "claude-fable-5-1" },
  effort: { type: "string", default: "high" }, "max-turns": { type: "string", default: "30" },
  out: { type: "string" }, sop: { type: "string", default: "sop/kyb_sop.md" }, spec: { type: "string", default: "spec/kyb-v1.json" },
} });
const arm = a.arm as Arm, level = a.level as Level;
const spec = kybSpec(a.spec);
const sop = readFileSync(join(ROOT, a.sop!), "utf8");
const wanted = a.case?.split(",");
const cases = loadExamples().filter((e) => !wanted || wanted.includes(e.case_id));
const out = join(ROOT, a.out ?? `runs/${new Date().toISOString().slice(0, 10)}`);
mkdirSync(out, { recursive: true });

const apiKey = process.env.RESOLVE_ANTHROPIC_API_KEY;
const client = arm === "resolve" && level === "facts" ? null : new Anthropic({ apiKey });
if (client && !apiKey) throw new Error("Set RESOLVE_ANTHROPIC_API_KEY.");

for (const c of cases) {
  for (let i = 1; i <= Number(a.n); i++) {
    const world = new KybWorld(c.case_id, c.facts, spec);
    const rec = client
      ? await runCase(client, world, arm, level, { model: a.model!, effort: a.effort as "high", maxTurns: Number(a["max-turns"]), sop })
      : resolveOnly(world);
    const file = join(out, `${c.case_id}-${arm}-${level}-${i}.json`);
    writeFileSync(file, JSON.stringify({ ...rec, sop: a.sop, spec: a.spec, evidence_log: world.evidence.log }, null, 1));
    const u = rec.usage;
    console.log(`${c.case_id} ${arm}/${level} #${i}: ${rec.outcome ?? "-"} (${rec.stopped}) ${(rec.ms / 1000).toFixed(1)}s, ${rec.turns} turns, ` +
      `${rec.evidence_calls} evidence calls / ${rec.evidence_requests} requests, ${rec.resolve_checks} checks, tokens in ${u.input}+${u.cache_read} cached, out ${u.output}`);
  }
}
