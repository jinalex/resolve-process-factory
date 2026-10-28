// Claude drafts a spec from an SOP, and every check runs on the draft:
//   pnpm propose-spec [approved spec, default spec/kyb-v1.json] [--model claude-opus-5-5] [--effort high]
// The call is saved whole to runs/spec/<id>.json (the prompt, the hash of every input, the model, the raw reply),
// so `pnpm replay <id>` can check it again without calling Claude. The key is read from RESOLVE_ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "./load.ts";
import { buildPrompt, parseReply, review, sha256, type Draft, type Review } from "./draft-spec.ts";
import type { Spec } from "./spec.ts";
import { shutdown } from "./z3.ts";

export const RUNS = join(ROOT, "runs/spec");

export type Run = {
  id: string; created: string;
  model: string; served_model: string; effort: string;
  approved_spec: string; sop_file: string;
  inputs: Record<string, string>;        // file -> sha256 of its contents when the prompt was built
  prompt_sha256: string; prompt: string;
  stop_reason: string | null; usage: unknown;
  reply: string;
  draft: Draft | null; parse_error?: string; check_error?: string;
  review: Review | null;
};

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

// The prompt for an approved spec, and the files it was built from.
export function promptFor(specFile: string) {
  const approved = loadSpec(specFile);
  const files = { template: "prompts/sop-to-spec.md", spec_ts: "core/spec.ts", vocabulary: `packs/${approved.domain}/vocabulary.md`,
                  sop: approved.sop.file, approved: specFile };
  const text = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, read(f)])) as Record<keyof typeof files, string>;
  const prompt = buildPrompt(text.template, { specTs: text.spec_ts, vocabulary: text.vocabulary, approved, sop: text.sop });
  return { approved, prompt, inputs: Object.fromEntries(Object.values(files).map((f) => [f, sha256(read(f))])) };
}

export async function ask(prompt: string, model: string, effort: "low" | "medium" | "high" | "xhigh" | "max") {
  const apiKey = process.env.RESOLVE_ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Set RESOLVE_ANTHROPIC_API_KEY to call Claude, or replay a saved run.");
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.stream({
    model, max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort },
    messages: [{ role: "user", content: prompt }],
  }).finalMessage();
  if (msg.stop_reason === "refusal") throw new Error(`Claude declined: ${JSON.stringify(msg.stop_details)}`);
  const reply = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { reply, served_model: msg.model, stop_reason: msg.stop_reason, usage: msg.usage };
}

// Parse and check a reply. A reply that doesn't parse, or a check that fails, is recorded with the error, not
// thrown away: the reply cost a model call, and the error is a finding too.
export async function check(approved: Spec, reply: string) {
  let draft: Draft | null = null, parse_error: string | undefined, check_error: string | undefined, r: Review | null = null;
  try { draft = parseReply(reply); } catch (e) { parse_error = (e as Error).message; }
  if (draft) try { r = await review(approved, draft, read(approved.sop.file)); } catch (e) { check_error = (e as Error).message; }
  return { draft, review: r, ...(parse_error ? { parse_error } : {}), ...(check_error ? { check_error } : {}) };
}

export function printReview(run: Pick<Run, "id" | "parse_error" | "check_error" | "review">) {
  const r = run.review;
  console.log(`Run ${run.id}`);
  if (run.check_error) return console.log(`  A check failed on the draft: ${run.check_error}`);
  if (!r) return console.log(`  The reply isn't a draft: ${run.parse_error}`);
  if (r.problems.length) {
    console.log(`  ${r.problems.length} problems; the draft can't be compared until a person fixes them:`);
    for (const p of r.problems) console.log(`  - ${p}`);
  }
  for (const n of r.needs) console.log(`  Needs a fact (${n.sop}): ${n.fact}`);
  if (r.problems.length) return;
  const same = r.findings.map((f) => f.id).sort().join() === [...r.approved_findings].sort().join();
  console.log(`  Z3 findings on the draft: ${r.findings.length}${same ? ", the same as on the approved spec" : ` (approved spec: ${r.approved_findings.join(", ")})`}`);
  for (const f of r.findings) console.log(`  - [${f.kind}] ${f.title}`);
  for (const w of r.word_maps) console.log(`  Reads the word "${w.word}" (${w.fact}) as ${w.draft ?? "unknown"}; the approved spec reads it as ${w.approved ?? "unknown"}.`);
  if (r.matches) console.log("  Same outcome as the approved spec in every case.");
  else for (const d of r.disagreements) console.log(`  Differs: approved says ${d.approved}, draft says ${d.draft}. Example: ${JSON.stringify(d.example)}`);
}

export function save(run: Run) {
  mkdirSync(RUNS, { recursive: true });
  writeFileSync(join(RUNS, `${run.id}.json`), JSON.stringify(run, null, 2) + "\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const specFile = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "spec/kyb-v1.json";
  const model = opt("--model", "claude-opus-5-5"), effort = opt("--effort", "high") as Parameters<typeof ask>[2];
  const { approved, prompt, inputs } = promptFor(specFile);
  const created = new Date().toISOString();
  const answer = await ask(prompt, model, effort);
  const id = `${approved.domain}-${created.replace(/[-:]/g, "").slice(0, 15)}-${sha256(answer.reply).slice(0, 6)}`;
  const run: Run = { id, created, model, served_model: answer.served_model, effort, approved_spec: specFile, sop_file: approved.sop.file,
                     inputs, prompt_sha256: sha256(prompt), prompt, stop_reason: answer.stop_reason, usage: answer.usage, reply: answer.reply,
                     draft: null, review: null };
  save(run);   // the reply first, so a check that fails doesn't lose it
  Object.assign(run, await check(approved, answer.reply));
  save(run);
  printReview(run);
  console.log(`Saved runs/spec/${id}.json`);
  await shutdown();
}
