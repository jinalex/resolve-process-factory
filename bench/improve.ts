// The improve loop's scorer. Each version of the agent's review notes (the runner's `skill` slot) is run end to end
// with Resolve on every synthetic case, and scored here against the approved spec. Writes rounds.json for the pane's
// Rounds tab and a summary for the repo.
//   node bench/improve.ts [--cases 60] [--out .resolve] [--summary bench/results/rounds]
// The versions are listed in bench/notes/versions.json, each with the runs recorded under it
// (`bench/run.ts --only e2e --arm resolve --notes <file>`). A version's `fixes` names the failure group it was
// written for, and `change` says how. No model calls here: Claude drafts the next version, this file scores it,
// and the maintainer accepts it in the pane.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";
import { ROOT } from "../core/load.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
import { evaluateIdentified } from "../packs/kyb/facts.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { type RunRecord, promptSetup } from "../runner/agent.ts";
import { generateCases } from "./cases.ts";
import { dollars } from "./prices.ts";
import { type RoundKey, lineDiff, recommend, round } from "./score.ts";

const { values: a } = parseArgs({ options: {
  cases: { type: "string", default: "60" }, out: { type: "string", default: ".resolve" }, summary: { type: "string", default: "bench/results/rounds" },
} });
type Version = { version: number; notes: string | null; runs: string; fixes?: string; change?: string };
const versions = JSON.parse(readFileSync(join(ROOT, "bench/notes/versions.json"), "utf8")) as Version[];
const spec = kybSpec();
const sop = readFileSync(join(ROOT, "sop/kyb_sop.md"), "utf8");
const cases = generateCases(Number(a.cases));
const byId = new Map(cases.map((c) => [c.case_id, c]));
const key = new Map<string, RoundKey>(cases.map((c) => { const r = evaluateIdentified(spec, c.facts); return [c.case_id, { outcome: r.outcome, notes: r.notes }]; }));
const text = (v: Version) => (v.notes ? readFileSync(join(ROOT, v.notes), "utf8") : "");

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
  // Runs under another SOP, prompt or set of notes, or on cases not generated here, are left out.
  const runs = all.filter((r) => byId.has(r.case_id) &&
    r.prompt_sha256 === promptSetup(new KybWorld(r.case_id, byId.get(r.case_id)!.facts, spec), "resolve", "e2e", sop, notes || undefined).sha256);
  if (!runs.length) throw new Error(`Notes v${v.version}: none of the ${all.length} runs in ${v.runs} were recorded under these notes and this SOP.`);
  if (runs.length < all.length) console.error(`Notes v${v.version}: ${all.length - runs.length} runs left out (other cases, SOP or notes)`);
  const s = round(runs.map((r) => ({ case_id: r.case_id, outcome: r.outcome, stopped: r.stopped, notes: r.resolve?.notes ?? [], usd: dollars(r), turns: r.turns, evidence_calls: r.evidence_calls, ms: r.ms })), key, before);
  before = s.lists;
  const next = versions[i + 1];
  const prev = versions[i - 1];
  return {
    n: i + 1, skill_version: v.version, passed: s.passed, correct: s.correct, total: s.total, got_worse: s.got_worse,
    groups: s.groups.map((g) => ({ ...g, change: next?.fixes === g.cause ? (next.change ?? "") : "" })),
    back_to_spec: [] as string[],
    skill_diff: prev ? [{ group: v.fixes || v.change || "", ...lineDiff(text(prev), notes) }] : [],
    model: runs[0].model, effort: runs[0].effort, runs: s.runs, usd_per_case: s.usd_per_case, turns_per_case: s.turns_per_case,
    evidence_calls_per_case: s.evidence_calls_per_case, s_per_case: s.s_per_case,
  };
});

// The version the maintainer accepted in the pane, if any.
const answers = resolve(ROOT, a.out!, "answers.jsonl");
const accepted = existsSync(answers)
  ? readFileSync(answers, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.type === "accept_skill").map((x) => x.version as number)
  : [];
// With nothing accepted yet, the first version is the one the agent runs. Each later round is compared with the
// version in use and says whether to take it.
const accepted_version = accepted.length ? Math.max(...accepted) : versions[0].version;
const inUse = rounds.find((r) => r.skill_version === accepted_version) ?? rounds[0];
const withRecommendation = rounds.map((r) => r === inUse
  ? { ...r, recommendation: { accept: false, text: `v${r.skill_version} is in use.` } }
  : { ...r, compared_to: inUse.skill_version, recommendation: recommend({ ...inUse, version: inUse.skill_version }, { ...r, version: r.skill_version }) });
const file = resolve(ROOT, a.out!, "rounds.json");
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify({ accepted_version, rounds: withRecommendation }, null, 1) + "\n");

const lines = [
  `# Improvement rounds: the agent's review notes, scored by Resolve`,
  ``,
  `${cases.length} synthetic KYB cases (bench/cases.ts), mocked evidence, SOP as written, end to end with Resolve. Each round is one version of the review notes (bench/notes/versions.json). Correct: every run of the case agrees with the approved spec on the full facts. Complete: every run submitted, and Resolve left open only what the full facts leave open too.`,
  ``,
  `| Round | Notes | Model | Runs | Correct | Complete | Failure groups | Cost per case | Turns per case | Evidence calls per case | Time per case | Recommendation |`,
  `| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ...withRecommendation.map((r) => `| ${r.n} | v${r.skill_version} | ${r.model} ${r.effort} | ${r.runs} | ${r.correct}/${r.total} | ${r.passed}/${r.total} | ${r.groups.length ? r.groups.map((g) => `${g.cause} (${g.cases.join(", ")})`).join("; ") : "none"} | $${r.usd_per_case.toFixed(4)} | ${r.turns_per_case.toFixed(1)} | ${r.evidence_calls_per_case.toFixed(1)} | ${r.s_per_case.toFixed(1)} s | ${r.recommendation.text} |`),
  ``,
  `A round with no failure groups leaves the notes nothing to fix: Resolve makes the decision, so the notes only steer what the agent gathers.`,
];
console.log(lines.join("\n"));
writeFileSync(resolve(ROOT, `${a.summary}.md`), lines.join("\n") + "\n");
console.log(`\nWrote ${file}`);
