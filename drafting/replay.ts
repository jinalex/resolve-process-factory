// Checks a saved draft again, without calling Claude: pnpm replay <run id> [--save | --live] [--allow-changed]
// It fails if the run doesn't hold together (the reply isn't the text of the saved response, or the prompt isn't
// the one hashed), if a file the prompt was built from has changed since (unless --allow-changed), or if today's
// checks reach a different verdict (--save records it as a recheck; the first verdict stays). With --live, it
// sends the run's own saved prompt to the same model again and saves the answer as a new run.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadSpec } from "../core/load.ts";
import { sha256 } from "./draft-spec.ts";
import { RUNS, ask, check, codeVersion, printReview, runProblems, save, verdict, type Run } from "./propose-spec.ts";
import { shutdown } from "../core/z3.ts";

const [id, ...rest] = process.argv.slice(2);
const file = join(RUNS, `${id}.json`);
if (!id || !existsSync(file)) { console.error(`No saved run ${id ?? ""} in runs/spec/.`); process.exit(1); }
const run: Run = JSON.parse(readFileSync(file, "utf8"));
const approved = loadSpec(run.approved_spec);
const fail = (why: string) => { console.error(why); process.exitCode = 1; };

const { broken, changed } = runProblems(run);
broken.forEach(fail);
for (const f of changed) (rest.includes("--allow-changed") ? console.log : fail)(`${f} has changed since this run.`);

if (process.exitCode) {
  console.error("Not checked. Pass --allow-changed to check it against today's files anyway.");
} else if (rest.includes("--live")) {
  const created = new Date().toISOString(), code = codeVersion();   // before the call, so a git failure can't lose a paid reply
  // The same request as the saved run, with its own saved prompt.
  const answer = await ask({ ...run.request, messages: [{ role: "user", content: run.prompt }] });
  const { parse_error: _p, check_error: _c, rechecks: _r, ...kept } = run;
  const next: Run = { ...kept, id: `${approved.domain}-${created.replace(/[-:]/g, "").slice(0, 15)}-${sha256(answer.reply).slice(0, 6)}`, created,
                      code, from_run: run.id, served_model: answer.served_model, request: answer.request, response: answer.response,
                      stop_reason: answer.stop_reason, usage: answer.usage, reply: answer.reply, draft: null, review: null };
  save(next);   // the reply first, so a check that fails doesn't lose it
  Object.assign(next, await check(approved, answer.reply));
  save(next);
  printReview(next);
  console.log(`Saved runs/spec/${next.id}.json, from run ${run.id}'s prompt`);
} else {
  const again = await check(approved, run.reply);
  printReview({ id: run.id, stop_reason: run.stop_reason, ...again });
  const last = run.rechecks?.at(-1) ?? run;
  if (!isDeepStrictEqual(verdict(again), verdict(last))) {
    if (rest.includes("--save")) {
      save({ ...run, rechecks: [...(run.rechecks ?? []), { at: new Date().toISOString(), code: codeVersion(), ...again }] });
      console.log(`Today's checks differ from the saved verdict; recorded as a recheck in runs/spec/${run.id}.json.`);
    } else fail("Today's checks differ from the saved verdict. Pass --save to record them as a recheck.");
  }
}
await shutdown();
