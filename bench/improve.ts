// The improve loop's scorer. Each version of the agent's setup (its model, effort and review notes, the runner's `skill`
// slot) is run end to end with Resolve on every synthetic case, and scored here against the approved spec. Writes rounds.json for the pane's
// Rounds tab and a summary for the repo.
//   node bench/improve.ts [--cases 60] [--out .resolve] [--summary bench/results/rounds]
// The versions are listed in bench/notes/versions.json, each with the runs recorded under it
// (`bench/run.ts --only e2e --arm resolve --e2e 60 --e2e-reps 3 --model <m> --effort <e> --notes <file>`). Every case in the key counts, so a
// case with no run fails the round. A version's `fixes` names the failure group it was
// written for, and `change` says how. No model calls here: Claude drafts the next version, this file scores it,
// and the maintainer accepts it in the pane.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { ROOT } from "../core/load.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
import { evaluateIdentified } from "../packs/kyb/facts.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { type RunRecord, promptSetup } from "../runner/agent.ts";
import { caseFingerprint, generateCases, replays } from "./cases.ts";
import { dollars } from "./prices.ts";
import { type RoundKey, acceptedVersions, lineDiff, recommendAll, round } from "./score.ts";
import type { RoundsJson } from "../mod/resolve/types/files.d.ts";

const { values: a } = parseArgs({ options: {
  cases: { type: "string", default: "60" }, out: { type: "string", default: ".resolve" }, summary: { type: "string", default: "bench/results/rounds" },
} });
type Version = { version: number; model: string; effort: string; notes: string | null; runs: string; fixes?: string; change?: string };
// How a setup reads in the pane: "Haiku 5.5 low · notes kyb-v2".
const setupName = (v: Version) => {
  const m = /^claude-(\w+)-(\d+)-(\d+)$/.exec(v.model);
  const model = m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2]}.${m[3]}` : v.model;
  return `${model} ${v.effort}${asSkill(text(v)) ? ` · notes ${basename(v.notes!, ".md")}` : ""}`;
};
const versions = JSON.parse(readFileSync(join(ROOT, "bench/notes/versions.json"), "utf8")) as Version[];
const spec = kybSpec();
const sop = readFileSync(join(ROOT, "sop/kyb_sop.md"), "utf8");
const cases = generateCases(Number(a.cases));
const byId = new Map(cases.map((c) => [c.case_id, c]));
const fingerprint = new Map(cases.map((c) => [c.case_id, caseFingerprint(c.facts, spec)]));
const key = new Map<string, RoundKey>(cases.map((c) => { const r = evaluateIdentified(spec, c.facts); return [c.case_id, { outcome: r.outcome, notes: r.notes }]; }));
// Notes that are only whitespace are no notes, as the runner treats them.
const text = (v: Version) => (v.notes ? readFileSync(resolve(ROOT, v.notes), "utf8") : "");
const asSkill = (t: string) => (t.trim() ? t : undefined);

// A folder of runs, one file a run, or the same packed as <folder>.jsonl.gz.
const load = (p: string): RunRecord[] => {
  const at = resolve(ROOT, p);
  if (p.endsWith(".jsonl.gz")) return gunzipSync(readFileSync(at)).toString().trim().split("\n").map((t) => JSON.parse(t));
  const dir = existsSync(join(at, "base")) ? join(at, "base") : at;
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
};

let before: { correct: string[]; complete: string[] } | undefined;
const rounds = versions.map((v, i) => {
  const notes = text(v);
  const all = load(v.runs).filter((r) => r.arm === "resolve" && r.level === "e2e");
  // Every run in the file must say which effort it ran at, so none is dropped for lacking it.
  const noEffort = all.filter((r) => !r.effort).length;
  if (noEffort) throw new Error(`Setup v${v.version}: ${noEffort} runs in ${v.runs} don't record their effort.`);
  // Runs under another model, effort, SOP, prompt or set of notes, or on cases not generated here, are left out. A run
  // must also have seen this case's facts and spec: by its case_sha256, or, for a run recorded before that was kept,
  // by replaying its evidence and final check on today's case (replays in bench/cases.ts).
  const runs = all.filter((r) => byId.has(r.case_id) && r.model === v.model && r.effort === v.effort &&
    r.prompt_sha256 === promptSetup(new KybWorld(r.case_id, byId.get(r.case_id)!.facts, spec), "resolve", "e2e", sop, asSkill(notes)).sha256 &&
    ((r as { case_sha256?: string }).case_sha256 !== undefined
      ? (r as { case_sha256?: string }).case_sha256 === fingerprint.get(r.case_id)
      : replays(r, byId.get(r.case_id)!.facts, spec)));
  if (!runs.length) throw new Error(`Setup v${v.version}: none of the ${all.length} runs in ${v.runs} were recorded under this model, effort, these notes and this SOP.`);
  if (runs.length < all.length) console.error(`Setup v${v.version}: ${all.length - runs.length} runs left out (other cases, model, effort, SOP or notes)`);
  const s = round(runs.map((r) => ({ case_id: r.case_id, outcome: r.outcome, stopped: r.stopped, notes: r.resolve?.notes ?? null, usd: dollars(r), turns: r.turns, evidence_calls: r.evidence_calls, ms: r.ms })), key, before);
  before = s.lists;
  const next = versions[i + 1];
  const prev = versions[i - 1];
  return {
    n: i + 1, skill_version: v.version, setup: setupName(v), passed: s.passed, correct: s.correct, total: s.total, got_worse: s.got_worse,
    groups: s.groups.map((g) => ({ ...g, change: next?.fixes === g.cause ? (next.change ?? "") : "" })),
    back_to_spec: [] as string[],
    skill_diff: prev ? [{ group: v.fixes || v.change || "", ...lineDiff(text(prev), notes) }] : [],
    model: runs[0].model, effort: runs[0].effort, runs: s.runs, usd_per_case: s.usd_per_case, turns_per_case: s.turns_per_case,
    evidence_calls_per_case: s.evidence_calls_per_case, s_per_case: s.s_per_case, lists: s.lists,
  };
});

// The version the maintainer accepted in the pane, if any: as the pane reads answers.jsonl, a line that doesn't parse
// is skipped, and an acceptance counts only for the spec the pane was showing (spec.json beside it) and only for a
// version scored here.
const at = (f: string) => resolve(ROOT, a.out!, f);
const readJson = (f: string) => { try { return JSON.parse(readFileSync(at(f), "utf8")); } catch { return null; } };
const shown = readJson("spec.json") as { version?: number; spec_hash?: string } | null;
const accepted = acceptedVersions(existsSync(at("answers.jsonl")) ? readFileSync(at("answers.jsonl"), "utf8") : "", shown, versions.map((v) => ({ version: v.version, setup: setupName(v) })));
// With nothing accepted yet, the first version is the one the agent runs. Each later round is compared with the best
// setup so far (recommendAll), so a round that only matches the last recommended setup says keep that one, and
// `best_version` names what to accept next.
const accepted_version = accepted.length ? Math.max(...accepted) : versions[0].version;
const chained = recommendAll(rounds, accepted_version);
const withRecommendation = chained.rounds.map(({ lists: _, ...r }) => r);
const file = at("rounds.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ accepted_version, best_version: chained.best_version, rounds: withRecommendation } satisfies RoundsJson, null, 1) + "\n");

const lines = [
  `# Improvement rounds: the agent's setup, scored by Resolve`,
  ``,
  `${cases.length} synthetic KYB cases (bench/cases.ts), mocked evidence, SOP as written, end to end with Resolve. Each round is one version of the agent's setup: model, effort and review notes (bench/notes/versions.json), compared with the best setup so far: the one in use, or a later one recommended over it. Correct: every run of the case agrees with the approved spec on the full facts. Complete: every run submitted, and Resolve left open only what the full facts leave open too.`,
  ``,
  `| Round | Setup | Runs | Correct | Complete | Failure groups | Cost per case | Turns per case | Evidence calls per case | Time per case | Recommendation |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ...withRecommendation.map((r) => `| ${r.n} | v${r.skill_version}: ${r.setup} | ${r.runs} | ${r.correct}/${r.total} | ${r.passed}/${r.total} | ${r.groups.length ? r.groups.map((g) => `${g.cause} (${g.cases.join(", ")})`).join("; ") : "none"} | $${r.usd_per_case.toFixed(4)} | ${r.turns_per_case.toFixed(1)} | ${r.evidence_calls_per_case.toFixed(1)} | ${r.s_per_case.toFixed(1)} s | ${r.recommendation.text} |`),
  ``,
  `Resolve makes the decision, so a setup can only change how completely, quickly and cheaply the agent gathers; a round with no failure groups is judged on cost and speed.`,
];
console.log(lines.join("\n"));
mkdirSync(dirname(resolve(ROOT, `${a.summary}.md`)), { recursive: true });
writeFileSync(resolve(ROOT, `${a.summary}.md`), lines.join("\n") + "\n");
console.log(`\nWrote ${file}`);
