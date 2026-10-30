// Claude writes the question, options and each option's spec edit for every finding the owner hasn't been asked:
//   pnpm write-options [--out dir] [--model claude-opus-5-5] [--effort high]
// Reads and updates the pane's spec.json in --out (default .resolve/). The edits only propose (principle 5): each one
// is checked here for loading and quoting the SOP, and pnpm resolve then works out what each option would change,
// which the owner sees before answering. Each call is saved whole to drafting/runs/options/<id>.json. The key is read from
// RESOLVE_ANTHROPIC_API_KEY.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, loadSpec } from "../core/load.ts";
import type { OptionEdits } from "../core/impact.ts";
import { meaning, specHash, writeFile } from "../core/pane.ts";
import { applyEdits, textProblems } from "../core/spec-edit.ts";
import type { Spec } from "../core/spec.ts";
import { formatDoc, sha256 } from "./draft-spec.ts";
import { ask, codeVersion, request } from "./propose-spec.ts";

export const RUNS = join(ROOT, "drafting/runs/options");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

type PaneFinding = { id: string; kind: string; rule_ids: string[]; sop_refs: string[]; title: string; example: string;
                     example_facts: unknown[]; explain: string; question: string | null; options: string[]; option_edits?: OptionEdits[]; answer?: unknown };
export type Reply = { question: string; options: OptionEdits[] };

// The edit format as Claude sees it: core/spec-edit.ts up to the record of answers, so the prompt can't drift from the code.
export function editsDoc(src: string) {
  const end = src.indexOf("// The owner's answer to a finding");
  if (end < 0) throw new Error("core/spec-edit.ts has no \"// The owner's answer to a finding\" line to cut the format at.");
  return src.slice(src.indexOf("export type SpecEdit"), end).trim();
}

export function buildPrompt(template: string, spec: Spec, f: PaneFinding, sop: string, specTs: string, editTs: string) {
  const { question: _q, options: _o, option_edits: _e, ...finding } = f;
  const { rulings: _r, ...rules } = spec;
  const fill: Record<string, string> = {
    FINDING: JSON.stringify(finding, null, 2), SPEC: JSON.stringify(rules, null, 2),
    EDITS: editsDoc(editTs), FORMAT: formatDoc(specTs), SOP: sop.trim(),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => fill[k] ?? m);
}

// The last ```json block in the reply, as a question and options. Anything else is a problem, not an answer.
export function parseReply(reply: string): Reply {
  const blocks = [...reply.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  const r = JSON.parse(blocks.length ? blocks[blocks.length - 1][1] : reply.trim());
  if (typeof r?.question !== "string" || !Array.isArray(r.options) || r.options.length < 2) throw new Error("The reply has no question with at least two options.");
  for (const o of r.options) {
    if (typeof o?.option !== "string" || typeof o.says !== "string" || !Array.isArray(o.edits)) throw new Error("An option has no label, sentence or list of edits.");
  }
  if (new Set(r.options.map((o: OptionEdits) => o.option)).size !== r.options.length) throw new Error("Two options have the same label.");
  return r;
}

// The quick checks, before the slow ones in pnpm resolve: each edit loads and quotes the SOP.
export function optionProblems(spec: Spec, r: Reply, sop: string) {
  return r.options.flatMap((o) => [...applyEdits(spec, o.edits).problems, ...textProblems(o.edits, sop)].map((p) => `"${o.option}": ${p}`));
}

// The replies, written into the spec.json as it is now. They are for the spec they were asked about, so a spec.json
// rewritten for another spec meanwhile gets none of them, and a finding gets one only while it says the same.
export function mergeReplies(now: { spec_hash: string; findings: PaneFinding[] }, askedOn: string, results: { f: PaneFinding; reply: Reply | null }[]) {
  if (now.spec_hash !== askedOn) throw new Error("spec.json was rewritten for another spec while Claude answered; run pnpm resolve, then this again. The replies are saved in drafting/runs/options/.");
  for (const r of results) {
    const f = now.findings.find((x) => x.id === r.f.id);
    if (r.reply && f && !f.answer && !f.question && meaning(f) === meaning(r.f)) Object.assign(f, { question: r.reply.question, options: r.reply.options.map((o) => o.option), option_edits: r.reply.options });
  }
  return now;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const opt = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const out = resolve(process.env.INIT_CWD ?? process.cwd(), opt("--out", join(ROOT, ".resolve")));
  const model = opt("--model", "claude-opus-5-5"), effort = opt("--effort", "high") as Parameters<typeof request>[2];
  try {
    const pane = JSON.parse(readFileSync(join(out, "spec.json"), "utf8"));
    // The spec.json names its spec by domain, version and fingerprint; the spec file must be that very spec.
    const specFile = `spec/${pane.domain}-v${pane.version}.json`;
    if (!existsSync(join(ROOT, specFile))) throw new Error(`There's no ${specFile} for the pane's spec.json.`);
    const spec = loadSpec(specFile);
    if (specHash(spec) !== pane.spec_hash) throw new Error(`${specFile} has changed since pnpm resolve wrote ${out}; run it again first.`);
    const sop = read(spec.sop.file), template = read("drafting/prompts/finding-options.md"), specTs = read("core/spec.ts"), editTs = read("core/spec-edit.ts");
    const open = (pane.findings as PaneFinding[]).filter((f) => !f.answer && !f.question && !f.option_edits);
    if (!open.length) console.log("Every finding already has a question.");
    const code = codeVersion();
    mkdirSync(RUNS, { recursive: true });
    // Each finding on its own: one failed call doesn't lose the replies already paid for.
    const settled = await Promise.allSettled(open.map(async (f) => {
      const prompt = buildPrompt(template, spec, f, sop, specTs, editTs);
      const created = new Date().toISOString();
      const { response, request: sent, ...answer } = await ask(request(prompt, model, effort));
      const id = `${spec.domain}-v${spec.version}-${f.id}-${created.replace(/[-:]/g, "").slice(0, 15)}-${sha256(answer.reply).slice(0, 6)}`;
      let reply: Reply | null = null, parse_error: string | undefined, problems: string[] = [];
      try { reply = parseReply(answer.reply); } catch (e) { parse_error = (e as Error).message; }
      if (reply) problems = optionProblems(spec, reply, sop);
      writeFileSync(join(RUNS, `${id}.json`), JSON.stringify({ id, created, code, model, served_model: answer.served_model, effort, finding: f.id,
        spec_file: specFile, spec_hash: pane.spec_hash, request: sent, response, prompt_sha256: sha256(prompt), prompt,
        stop_reason: answer.stop_reason, usage: answer.usage, reply: answer.reply, parsed: reply, parse_error, problems }, null, 2) + "\n");
      return { f, id, reply, parse_error, problems };
    }));
    const results = settled.flatMap((s, i) => {
      if (s.status === "fulfilled") return [s.value];
      console.log(`${open[i].title}: the call to Claude failed: ${(s.reason as Error)?.message ?? s.reason}`);
      process.exitCode = 1;
      return [];
    });
    // Re-read just before writing, so nothing the pane or a person wrote since is lost. The replies are for the
    // spec they were asked about, so a spec.json rewritten for another spec meanwhile gets none of them.
    const now = JSON.parse(readFileSync(join(out, "spec.json"), "utf8"));
    for (const r of results) {
      console.log(`${r.f.title} (drafting/runs/options/${r.id}.json)`);
      if (!r.reply) { console.log(`  The reply isn't usable: ${r.parse_error}`); continue; }
      console.log(`  ${r.reply.question}`);
      for (const o of r.reply.options) console.log(`  - ${o.option}: ${o.says}`);
      for (const p of r.problems) console.log(`  Problem: ${p}`);
    }
    writeFile(out, "spec.json", mergeReplies(now, pane.spec_hash, results));
    console.log("Run pnpm resolve to work out what each option would change.");
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  }
}
