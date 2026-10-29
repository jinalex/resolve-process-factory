// Checks a saved draft again, without calling Claude: pnpm replay <run id> [--save | --live]
// It says if any file the prompt was built from has changed since the run. With --live, it sends the run's own
// saved prompt to the same model again and saves the answer as a new run, so the old one stays as it was.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "./load.ts";
import { sha256 } from "./draft-spec.ts";
import { RUNS, ask, check, codeVersion, printReview, save, type Run } from "./propose-spec.ts";
import { shutdown } from "./z3.ts";

const [id, ...rest] = process.argv.slice(2);
const file = join(RUNS, `${id}.json`);
if (!id || !existsSync(file)) { console.error(`No saved run ${id ?? ""} in runs/spec/.`); process.exit(1); }
const run: Run = JSON.parse(readFileSync(file, "utf8"));
const approved = loadSpec(run.approved_spec);

if (sha256(run.prompt) !== run.prompt_sha256) console.log("The saved prompt doesn't match its hash; the run file has been edited.");
for (const [f, h] of Object.entries(run.inputs)) {
  if (!existsSync(join(ROOT, f)) || sha256(readFileSync(join(ROOT, f), "utf8")) !== h) console.log(`${f} has changed since this run.`);
}

if (rest.includes("--live")) {
  const created = new Date().toISOString();
  // The same request as the saved run, with its own saved prompt.
  const answer = await ask({ ...run.request, messages: [{ role: "user", content: run.prompt }] });
  const { parse_error: _p, check_error: _c, ...kept } = run;
  const next: Run = { ...kept, id: `${approved.domain}-${created.replace(/[-:]/g, "").slice(0, 15)}-${sha256(answer.reply).slice(0, 6)}`, created,
                      code: codeVersion(), from_run: run.id, served_model: answer.served_model, request: answer.request, response: answer.response,
                      stop_reason: answer.stop_reason, usage: answer.usage, reply: answer.reply, ...(await check(approved, answer.reply)) };
  save(next);
  printReview(next);
  console.log(`Saved runs/spec/${next.id}.json, from run ${run.id}'s prompt`);
} else {
  const again = { id: run.id, ...(await check(approved, run.reply)) };
  printReview(again);
  // --save keeps the reply and records what today's checks say about it, e.g. after a check changes.
  if (rest.includes("--save")) {
    const { parse_error: _p, check_error: _c, ...kept } = run;
    save({ ...kept, ...again });
    console.log(`Saved today's checks to runs/spec/${run.id}.json`);
  }
}
await shutdown();
