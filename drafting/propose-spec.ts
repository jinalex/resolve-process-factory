// Claude drafts a spec from an SOP, and every check runs on the draft:
//   pnpm propose-spec [approved spec, default spec/kyb-v1.json] [--model claude-opus-5-5] [--effort high]
// The call is saved whole to drafting/runs/spec/<id>.json: the commit and files the prompt was built from, the request as
// sent (all but the key), and the response as received, with the summary of Claude's reasoning. `pnpm replay <id>`
// checks it again without calling Claude. The key is read from RESOLVE_ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../core/load.ts";
import { buildPrompt, parseReply, review, sha256, type Draft, type Review } from "./draft-spec.ts";
import type { Spec } from "../core/spec.ts";
import { shutdown } from "../core/z3.ts";

export const RUNS = join(ROOT, "drafting/runs/spec");

export type Run = {
  id: string; created: string; from_run?: string;   // from_run: a --live replay of that run's prompt
  code: Code;                                 // the code that built the prompt, called Claude and checked the reply
  model: string; served_model: string; effort: string;
  request: Omit<Request, "messages"> & { messages: "the prompt below, as the one user message" };
  response: Anthropic.Message;                // as received: Claude's reasoning summary, the reply, usage, IDs
  approved_spec: string; sop_file: string;
  inputs: Record<string, string>;        // file -> sha256 of its contents when the prompt was built
  prompt_sha256: string; prompt: string;
  stop_reason: string | null; usage: unknown;
  reply: string;
  draft: Draft | null; parse_error?: string; check_error?: string;
  review: Review | null;
  // Later checks of the same reply (pnpm replay --save), each with the code that ran it. The first verdict stays.
  rechecks?: { at: string; code: Code; draft: Draft | null; parse_error?: string; check_error?: string; review: Review | null }[];
};

// A commit, and each file changed since it with a hash of its contents, so two different edits don't look alike.
type Code = { commit: string; uncommitted: { status: string; file: string; sha256: string | null }[]; sdk: string; node: string };

// The text of Claude's answer, from the response as received.
export const replyOf = (msg: Anthropic.Message) => msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");

// What a check concluded, without the parts Z3 may pick differently from one run to the next (example cases and
// titles), so a replay can say whether today's checks agree with the saved ones.
export const verdict = (r: Pick<Run, "parse_error" | "check_error" | "review">) => {
  const v = r.review;
  return { parse_error: r.parse_error ?? null, check_error: r.check_error ?? null, review: v && {
    problems: v.problems, needs: v.needs, noted: v.noted, slots: v.slots, same_findings: v.same_findings, matches: v.matches, word_maps: v.word_maps,
    findings: v.findings.map((f) => `${f.kind} ${f.id}`).sort(), disagreements: v.disagreements.map((d) => `${d.approved}->${d.draft}`).sort() } };
};

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

// The prompt for an approved spec, and the files it was built from.
function promptFor(specFile: string) {
  // The approved spec is parsed from the same text that is hashed and given to Claude.
  const approvedText = read(specFile), approved = JSON.parse(approvedText) as Spec;
  const files = { template: "drafting/prompts/sop-to-spec.md", spec_ts: "core/spec.ts", vocabulary: `packs/${approved.domain}/vocabulary.md`,
                  sop: approved.sop.file, approved: specFile };
  const text = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, k === "approved" ? approvedText : read(f)])) as Record<keyof typeof files, string>;
  const prompt = buildPrompt(text.template, { specTs: text.spec_ts, vocabulary: text.vocabulary, approved, sop: text.sop });
  // Hashed from the same text the prompt was built from, so the hashes describe what Claude was given.
  return { approved, prompt, inputs: Object.fromEntries(Object.entries(files).map(([k, f]) => [f, sha256(text[k as keyof typeof files])])) };
}

type Request = Anthropic.MessageCreateParamsNonStreaming;

// The request for a prompt. Claude's reasoning comes back as a summary, so it is part of the trace.
export const request = (prompt: string, model: string, effort: "low" | "medium" | "high" | "xhigh" | "max"): Request => ({
  model, max_tokens: 64000,
  thinking: { type: "adaptive", display: "summarized" },
  output_config: { effort },
  messages: [{ role: "user", content: prompt }],
});

export async function ask(req: Request) {
  const apiKey = process.env.RESOLVE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Set RESOLVE_ANTHROPIC_API_KEY to call Claude, or replay a saved run.");
  // A refusal comes back like any answer and is saved; its empty reply fails to parse.
  const msg = await new Anthropic({ apiKey }).messages.stream(req).finalMessage();
  const { messages: _m, ...sent } = req;
  return { reply: replyOf(msg), served_model: msg.model, stop_reason: msg.stop_reason, usage: msg.usage, response: msg,
           request: { ...sent, messages: "the prompt below, as the one user message" as const } };
}

// The commit the code ran from, and any files changed since it, so a run says exactly what code made it.
export function codeVersion(): Code {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
  const sdk = JSON.parse(read("node_modules/@anthropic-ai/sdk/package.json")).version;
  // Saved runs are what the code writes, not code.
  const uncommitted = git("status", "--porcelain", "--untracked-files=all", "--", ".", ":!drafting/runs", ":!runner/runs", ":!runs").split("\n").filter(Boolean).map((l) => {
    const file = l.slice(3).replace(/^.* -> /, "");
    return { status: l.slice(0, 2), file, sha256: existsSync(join(ROOT, file)) ? sha256(readFileSync(join(ROOT, file))) : null };
  });
  return { commit: git("rev-parse", "HEAD").trim(), uncommitted, sdk, node: process.version };
}

// Parse and check a reply. A reply that doesn't parse, or a check that fails, is recorded with the error, not
// thrown away: the reply cost a model call, and the error is a finding too.
export async function check(approved: Spec, reply: string) {
  let draft: Draft | null = null, parse_error: string | undefined, check_error: string | undefined, r: Review | null = null;
  try { draft = parseReply(reply); } catch (e) { parse_error = (e as Error).message; }
  if (draft) try { r = await review(approved, draft, read(approved.sop.file)); } catch (e) { check_error = (e as Error).message; }
  return { draft, review: r, ...(parse_error ? { parse_error } : {}), ...(check_error ? { check_error } : {}) };
}

// Saved runs keep the paths their inputs had then; a file that has only moved since is the same input.
const MOVED: [string, string][] = [["prompts/", "drafting/prompts/"]];
export const moved = (f: string) => MOVED.reduce((p, [from, to]) => (p.startsWith(from) ? to + p.slice(from.length) : p), f);

// Whether a saved run holds together (its reply is the text of its response, its prompt the one hashed), and which
// files the prompt was built from have changed since.
export function runProblems(run: Run) {
  const broken: string[] = [];
  if (sha256(run.prompt) !== run.prompt_sha256) broken.push("The saved prompt doesn't match its hash; the run file has been edited.");
  if (run.reply !== replyOf(run.response)) broken.push("The saved reply isn't the text of the saved response; the run file has been edited.");
  const changed = Object.entries(run.inputs).filter(([f, h]) => !existsSync(join(ROOT, moved(f))) || sha256(read(moved(f))) !== h).map(([f]) => f);
  return { broken, changed };
}

export function printReview(run: Pick<Run, "id" | "stop_reason" | "parse_error" | "check_error" | "review">) {
  const r = run.review;
  console.log(`Run ${run.id}`);
  if (run.stop_reason === "refusal") console.log("  Claude declined to answer.");
  if (run.check_error) return console.log(`  A check failed on the draft: ${run.check_error}`);
  if (!r) return console.log(`  The reply isn't a draft: ${run.parse_error}`);
  if (r.problems.length) {
    console.log(`  ${r.problems.length} problems; the draft can't be compared until a person fixes them:`);
    for (const p of r.problems) console.log(`  - ${p}`);
  }
  for (const n of r.needs) console.log(`  Needs a fact (${n.sop}): ${n.fact}`);
  if (r.problems.length) return;
  for (const n of r.noted) console.log(`  Section ${n.sop} has no rule, only a note, for a person to read: ${n.note}`);
  console.log(`  Z3 findings on the draft: ${r.findings.length}${r.same_findings ? ", the same as on the approved spec" : ` (approved spec: ${r.approved_findings.map((f) => f.id).join(", ")})`}`);
  for (const f of r.findings) console.log(`  - [${f.kind}] ${f.title}`);
  for (const w of r.word_maps) console.log(`  Reads the word "${w.word}" (${w.fact}) as ${w.draft ?? "unknown"}; the approved spec reads it as ${w.approved ?? "unknown"}.`);
  const upTo = `in every case with up to ${r.slots} items in each list`;
  if (!r.disagreements.length) console.log(`  Same outcome as the approved spec ${upTo}.`);
  else for (const d of r.disagreements) console.log(`  Differs (${upTo}): approved says ${d.approved}, draft says ${d.draft}. Example: ${JSON.stringify(d.example)}`);
}

export function save(run: Run) {
  mkdirSync(RUNS, { recursive: true });
  writeFileSync(join(RUNS, `${run.id}.json`), JSON.stringify(run, null, 2) + "\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const specFile = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "spec/kyb-v1.json";
  const model = opt("--model", "claude-opus-5-5"), effort = opt("--effort", "high") as Parameters<typeof request>[2];
  const { approved, prompt, inputs } = promptFor(specFile);
  const created = new Date().toISOString();
  const code = codeVersion();
  const { response, request: sent, ...answer } = await ask(request(prompt, model, effort));
  const id = `${approved.domain}-${created.replace(/[-:]/g, "").slice(0, 15)}-${sha256(answer.reply).slice(0, 6)}`;
  const run: Run = { id, created, code, model, served_model: answer.served_model, effort, request: sent, response,
                     approved_spec: specFile, sop_file: approved.sop.file, inputs, prompt_sha256: sha256(prompt), prompt,
                     stop_reason: answer.stop_reason, usage: answer.usage, reply: answer.reply, draft: null, review: null };
  save(run);   // the reply first, so a check that fails doesn't lose it
  Object.assign(run, await check(approved, answer.reply));
  save(run);
  printReview(run);
  console.log(`Saved drafting/runs/spec/${id}.json`);
  await shutdown();
}
