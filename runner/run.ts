// Runs the case runner on KYB example cases and records each run.
//   node runner/run.ts --arm agentic|resolve --level facts|e2e [--case EX-1,EX-5] [--n 1] [--model ...] [--effort high]
// Writes one JSON per run into runner/runs/<date>/ (or --out). Needs RESOLVE_ANTHROPIC_API_KEY, else ANTHROPIC_API_KEY.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { KEY_HELP, apiKey as resolveKey } from "../drafting/api-key.ts";
import { ROOT } from "../core/load.ts";
import { kybSpec, loadExamples } from "../packs/kyb/examples.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { runCase, resolveOnly } from "./agent.ts";
import { DEFAULT_SPEC } from "../core/current-spec.ts";

const { values: a } = parseArgs({ options: {
  arm: { type: "string", default: "agentic" }, level: { type: "string", default: "e2e" }, case: { type: "string" },
  n: { type: "string", default: "1" }, model: { type: "string", default: "claude-fable-5-1" },
  effort: { type: "string", default: "high" }, "max-turns": { type: "string", default: "30" },
  out: { type: "string" }, sop: { type: "string", default: "sop/kyb_sop.md" }, spec: { type: "string", default: DEFAULT_SPEC },
} });
const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[], name: string): T => {
  if (!allowed.includes(v as T)) throw new Error(`--${name} must be one of ${allowed.join(", ")}`);
  return v as T;
};
const arm = oneOf(a.arm, ["agentic", "resolve"] as const, "arm"), level = oneOf(a.level, ["facts", "e2e"] as const, "level");
const effort = oneOf(a.effort, ["low", "medium", "high", "xhigh", "max"] as const, "effort");
const spec = kybSpec(a.spec);
const sop = readFileSync(join(ROOT, a.sop!), "utf8");
const wanted = a.case?.split(",");
const cases = loadExamples().filter((e) => !wanted || wanted.includes(e.case_id));
const out = join(ROOT, a.out ?? `runner/runs/${new Date().toISOString().slice(0, 10)}`);
mkdirSync(out, { recursive: true });

const apiKey = resolveKey();
const needsModel = !(arm === "resolve" && level === "facts");
if (needsModel && !apiKey) throw new Error(KEY_HELP);
const client = needsModel ? new Anthropic({ apiKey }) : null;

for (const c of cases) {
  for (let i = 1; i <= Number(a.n); i++) {
    const world = new KybWorld(c.case_id, c.facts, spec);
    let rec;
    try {
      rec = client
        ? await runCase(client, world, arm, level, { model: a.model!, effort, maxTurns: Number(a["max-turns"]), sop })
        : resolveOnly(world);
    } catch (e) {
      console.error(`${c.case_id} ${arm}/${level} #${i}: ${(e as Error).message}`); // one failed case doesn't stop the rest
      continue;
    }
    const file = join(out, `${c.case_id}-${arm}-${level}-${i}.json`);
    writeFileSync(file, JSON.stringify({ ...rec, sop: a.sop, spec: a.spec, evidence_log: world.evidence.log }, null, 1));
    const u = rec.usage;
    console.log(`${c.case_id} ${arm}/${level} #${i}: ${rec.outcome ?? "-"} (${rec.stopped}) ${(rec.ms / 1000).toFixed(1)}s, ${rec.turns} turns, ` +
      `${rec.evidence_calls} evidence calls / ${rec.evidence_requests} requests, ${rec.resolve_checks} checks, tokens in ${u.input}+${u.cache_read} cached, out ${u.output}`);
  }
}
