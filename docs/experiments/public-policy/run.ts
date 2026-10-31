// A spike: run a public regulation and someone else's labelled cases through drafting, end to end.
//   node docs/experiments/public-policy/run.ts <policy> facts            Claude lists the facts the procedure needs
//   node docs/experiments/public-policy/run.ts <policy> draft [n]        Claude drafts the spec n times; every check runs on each
//   node docs/experiments/public-policy/run.ts <policy> check            the checks again on every saved draft
//   node docs/experiments/public-policy/run.ts <policy> agent [model]    the agent loop: asks only the facts Resolve still needs
//   node docs/experiments/public-policy/run.ts <policy> read [model]     a model fills in the facts from each case's text
//   node docs/experiments/public-policy/run.ts <policy> direct [model]   the baseline: a model answers each case itself
//   node docs/experiments/public-policy/run.ts <policy> notes [reader]   one improve round: notes for the reader from half the cases
//   node docs/experiments/public-policy/run.ts <policy> score            the drafts on the cases, against the labels
//   node docs/experiments/public-policy/run.ts <policy> pack             packs runs/ into runs.json.gz, which the repo keeps
// Each step saves its calls whole in docs/experiments/public-policy/<policy>/runs/, which is unpacked from runs.json.gz
// (runs.ts). Nothing here changes the core or a pack: the drafting prompt, its checks, Z3 and the evaluator are the
// ones KYB and expenses use.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../../core/load.ts";
import { evaluate, readFact, type Case, type Item } from "../../../core/evaluate.ts";
import { checkSop } from "../../../core/sop-checks.ts";
import type { FactDecl, Spec } from "../../../core/spec.ts";
import { shutdown } from "../../../core/z3.ts";
import { assemble, buildPrompt, draftProblems, parseReply, sha256, type Draft } from "../../../drafting/draft-spec.ts";
import { ask, codeVersion, request } from "../../../drafting/propose-spec.ts";
import { pack, unpack } from "./runs.ts";

const [policy, step, arg] = process.argv.slice(2);
const flag = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const DIR = join(ROOT, "docs/experiments/public-policy", policy ?? "");
if (!policy || !existsSync(join(DIR, "policy.json"))) { console.error("Usage: run.ts <policy> facts|draft|check|read|direct|agent|notes|score|pack"); process.exit(1); }
const RUNS = join(DIR, "runs");
unpack(DIR);
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const rel = (f: string) => `docs/experiments/public-policy/${policy}/${f}`;
const save = (name: string, x: unknown) => writeFileSync(join(RUNS, name), JSON.stringify(x, null, 2) + "\n");
const load = <T>(name: string): T => JSON.parse(readFileSync(join(RUNS, name), "utf8"));

// What the policy folder gives: the SOP, the outcomes, and the labelled cases with the outcome each label means.
// `stipulated`: facts every case's text states as a premise in words no reader maps to a fact ("is a telemarketer
// subject to the Telemarketing Sales Rule"), named by the keys of the fact list Claude wrote. Scored as its own reading.
type Policy = { domain: string; sop: string; revision: string; outcomes: string[]; cases: { file: string; id: string; text: string; label: string; split: string }[];
                labels: Record<string, string>; stipulated?: { why: string; facts: Record<string, string> } };
const P: Policy = JSON.parse(readFileSync(join(DIR, "policy.json"), "utf8"));
// The saved drafts that loaded and passed every check, by file name; the notes and agent steps use the first.
const goodDrafts = () => readdirSync(RUNS).filter((f) => f.startsWith("draft-")).sort()
  .filter((f) => { const d = load<{ draft?: Draft; problems?: string[] }>(f); return d.draft && !d.problems?.length; });
const firstDraft = () => goodDrafts()[0];
// Runs f on every case, eight at a time, and saves after each batch, so a failed call costs one case, not the step.
async function inBatches(step: string, all: LabelledCase[], f: (c: LabelledCase) => Promise<Record<string, unknown>>, write: (out: Record<string, unknown>[]) => void) {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < all.length; i += 8) {
    out.push(...await Promise.all(all.slice(i, i + 8).map((c) => f(c).catch((e) => ({ id: c.id, error: (e as Error).message })))));
    write(out);
    console.log(`${step} ${Math.min(i + 8, all.length)}/${all.length}`);
  }
  return out;
}
const REVIEW = "review";   // the outcome for a case the rules can't decide, named the same in every policy
const sop = read(rel(P.sop));
type LabelledCase = { id: string; split: string; text: string; label: string; expected: string };
function cases(): LabelledCase[] {
  return P.cases.flatMap((src) => {
    const [head, ...rows] = read(rel(src.file)).trim().split("\n").map((l) => l.split("\t"));
    const col = (k: string) => head.indexOf(k);
    return rows.map((r) => ({ id: `${src.split}-${r[col(src.id)]}`, split: src.split, text: r[col(src.text)], label: r[col(src.label)],
                              expected: P.labels[r[col(src.label)]] }));
  });
}

// The improve loop learns on one half of the cases and is scored on the other: every other case, in sorted ID order
// (test-0, test-1, test-10, ...), so the split is fixed for a given set of cases.
const heldIds = new Set(cases().map((c) => c.id).sort().filter((_, i) => i % 2 === 1));
const heldOut = (id: string) => heldIds.has(id);

type FactList = { facts: (FactDecl & { meaning: string; sop?: string[] })[]; collections: { key: string; item: string; meaning: string }[] };
const effort = "high" as const;
const call = async (prompt: string, model: string, thinking: boolean) => {
  const req = thinking ? request(prompt, model, effort) : { model, max_tokens: 8000, messages: [{ role: "user" as const, content: prompt }] };
  return { prompt_sha256: sha256(prompt), ...(await ask(req)) };
};

// The facts as the drafting prompt and the case reader see them, and the skeleton spec that gives them: facts,
// lists and outcomes, with no decisions.
function vocabulary(f: FactList) {
  const line = (x: FactList["facts"][number]) => `- \`${x.key}\` (${x.numeric ? "a number" : (x.values ?? ["any value"]).join(" / ")}): ${x.meaning}`;
  return [`# What a case supplies`, "", "Listed by Claude from the procedure (step `facts`), before any case was read.", "",
          "## The case", "", ...f.facts.filter((x) => x.per === "case").map(line),
          ...f.collections.flatMap((c) => ["", `## ${c.key} (one item per ${c.item}: ${c.meaning})`, "", ...f.facts.filter((x) => x.per === c.key).map(line)])].join("\n") + "\n";
}
function skeleton(f: FactList): Spec {
  return { domain: P.domain, version: 0, sop: { file: rel(P.sop), revision: P.revision }, order: P.outcomes, order_sop: "",
           unknowns: { sop: "", text: "", then: REVIEW },
           facts: f.facts.map(({ key, per, values, numeric }) => ({ key, per, ...(values ? { values } : {}), ...(numeric ? { numeric } : {}) })),
           collections: f.collections.map(({ key, item }) => ({ key, item })), computed: [], lists: {}, rules: [] };
}

if (step === "facts") {
  const prompt = read("docs/experiments/public-policy/prompts/sop-to-facts.md").replace("{{OUTCOMES}}", P.outcomes.map((o) => `"${o}"`).join(", ")).replace("{{SOP}}", sop.trim());
  const model = arg ?? "claude-opus-5-5";
  const answer = await call(prompt, model, true);
  const list = parseReply(answer.reply) as unknown as FactList;
  save("facts.json", { created: new Date().toISOString(), code: codeVersion(), model, effort, prompt, ...answer, list });
  writeFileSync(join(DIR, "vocabulary.md"), vocabulary(list));
  writeFileSync(join(DIR, "skeleton.json"), JSON.stringify(skeleton(list), null, 2) + "\n");
  console.log(`${list.facts.length} facts, ${list.collections.length} lists. Wrote vocabulary.md and skeleton.json.`);
}

// Z3's checks share one solver context, so drafts are checked one at a time; only the model calls run together.
async function checkDraft(skel: Spec, run: Record<string, unknown>, id: string) {
  try {
    const draft = parseReply(run.reply as string);
    const problems = draftProblems(skel, draft, sop);
    // Z3's checks need a spec that loads; a draft with problems gets its problems and nothing else.
    const findings = problems.length ? [] : (await checkSop(assemble(skel, draft))).map(({ id, kind, title, sop_refs, rule_ids }) => ({ id, kind, title, sop_refs, rule_ids }));
    Object.assign(run, { draft, problems, needs: draft.needs ?? [], findings, error: undefined });
    console.log(`${id}: ${draft.rules.length} rules, ${problems.length} problems, ${findings.length} Z3 findings, ${(draft.needs ?? []).length} needs`);
  } catch (e) { run.error = (e as Error).message; console.log(`${id}: ${run.error}`); }
  save(`${id}.json`, run);
}

if (step === "draft") {
  const skel: Spec = JSON.parse(read(rel("skeleton.json")));
  const prompt = buildPrompt(read("prompts/sop-to-spec.md"), { specTs: read("core/spec.ts"), vocabulary: read(rel("vocabulary.md")), approved: skel, sop });
  const n = Number(arg ?? 1), model = "claude-opus-5-5";
  const runs = await Promise.all(Array.from({ length: n }, async () => {
    const answer = await call(prompt, model, true);
    const run: Record<string, unknown> = { created: new Date().toISOString(), code: codeVersion(), model, effort, prompt, ...answer };
    const id = `draft-${sha256(answer.reply).slice(0, 6)}`;
    save(`${id}.json`, run);
    return { id, run };
  }));
  for (const { id, run } of runs) await checkDraft(skel, run, id);
}

// Checks the saved drafts again, e.g. after a check failed.
if (step === "check") {
  const skel: Spec = JSON.parse(read(rel("skeleton.json")));
  for (const f of readdirSync(RUNS).filter((f) => f.startsWith("draft-"))) await checkDraft(skel, load(f), f.replace(".json", ""));
}

if (step === "read") {
  const model = arg ?? "claude-haiku-5-5";
  const notes = flag("--notes");   // a file in the policy folder, from the notes step
  let template = read("docs/experiments/public-policy/prompts/read-case.md").replace("{{VOCABULARY}}", read(rel("vocabulary.md")).replace(/^# .*\n+.*\n+/, "").trim());
  if (notes) template = template.replace("## The record", `## Notes on reading these records\n\n${read(rel(notes)).trim()}\n\n## The record`);
  const all = cases().filter((c) => !notes || heldOut(c.id)), created = new Date().toISOString();
  await inBatches("read", all, async (c) => {
    const answer = await call(template.split("{{RECORD}}").join(c.text), model, false);
    let read: unknown = null, error: string | undefined;
    try { read = parseReply(answer.reply); } catch (e) { error = (e as Error).message; }
    return { id: c.id, model, ...answer, read, ...(error ? { error } : {}) };
  }, (out) => save(`read-${model}${notes ? `-${notes.replace(/\W+/g, "-")}` : ""}.json`, { created, code: codeVersion(), notes, template_sha256: sha256(template), cases: out }));
}

// One round of the improve loop: Claude reads the learning half's reviews and mistakes, with the labels, and writes
// notes for the reader. The held-out half is never shown.
if (step === "notes") {
  const reader = arg ?? "claude-opus-5-5", out = flag("--out") ?? "notes-v1.md", skel: Spec = JSON.parse(read(rel("skeleton.json")));
  const draftFile = firstDraft();
  const spec = assemble(skel, load<{ draft: Draft }>(draftFile).draft);
  const reads = load<{ cases: { id: string; read: Parameters<typeof toCase>[1] }[] }>(`read-${reader}.json`).cases;
  const shown = cases().filter((c) => !heldOut(c.id)).flatMap((c) => {
    const r = reads.find((x) => x.id === c.id)?.read ?? null, res = evaluate(spec, toCase(spec, r, false, false));
    if (res.outcome === c.expected) return [];
    const known = Object.fromEntries(Object.entries(r?.facts ?? {}).filter(([, a]) => a?.value !== "unknown").map(([k, a]) => [k, a?.value]));
    return [`### Record\n\n${c.text}\n\nLawyer's answer: ${c.expected}. Decision: ${res.outcome}.\n\nFacts the reader filled in (all others unknown): ${JSON.stringify(known)}\n\nRules that might have applied: ${res.might_apply.map((h) => h.rule).join(", ") || "none"}. Rules that applied: ${res.applied.map((h) => h.rule).join(", ") || "none"}.`];
  });
  const prompt = read("docs/experiments/public-policy/prompts/write-notes.md").replace("{{VOCABULARY}}", read(rel("vocabulary.md")).replace(/^# .*\n+.*\n+/, "").trim())
    .replace("{{SOP}}", sop.trim()).replace("{{CASES}}", shown.join("\n\n"));
  const answer = await call(prompt, "claude-opus-5-5", true);
  save(`notes-${sha256(answer.reply).slice(0, 6)}.json`, { created: new Date().toISOString(), code: codeVersion(), draft: draftFile, reader, shown: shown.length, prompt, ...answer });
  writeFileSync(join(DIR, out), answer.reply.trim() + "\n");
  console.log(`${shown.length} learning-half cases shown. Wrote ${out}.`);
}

if (step === "direct") {
  const model = arg ?? "claude-haiku-5-5";
  const all = cases(), created = new Date().toISOString();
  // The baseline gets the same text the drafting step got, minus our section 1, and answers as LegalBench asks.
  const rule = sop.slice(sop.indexOf("## 2."));
  const out = await inBatches("direct", all, async (c) => {
    const prompt = `${rule.trim()}\n\nQuestion: ${c.text}\nAnswer with one word, Yes or No.`;
    const answer = await call(prompt, model, false);
    const word = answer.reply.trim().match(/^[*_\s]*(yes|no)\b/i)?.[1];   // the first word: an explanation may say "yes" too
    return { id: c.id, model, ...answer, answer: word ? (word.toLowerCase() === "yes" ? "Yes" : "No") : null };
  }, (out) => save(`direct-${model}.json`, { created, code: codeVersion(), cases: out }));
  console.log(`${out.filter((c) => c.answer === all.find((x) => x.id === c.id)!.label).length}/${all.length} match the labels`);
}

// A case as the evaluator sees it, from a reader's answers. Closed world reads "unknown" as "no" for every yes/no fact,
// which Resolve never does on its own. It is shown to say why not: for a disclosure fact, "no" means "not disclosed",
// so silence turns into a violation. The premise fills only facts the reader left unknown.
type Answer = { value?: unknown; quote?: string };
function toCase(spec: Spec, r: { facts?: Record<string, Answer>; items?: Record<string, Record<string, Answer | string>[]> } | null, closed: boolean, stipulate: boolean): Case {
  const val = (key: string, a: Answer | undefined) => {
    let v = a?.value === undefined || a?.value === null ? "unknown" : String(a.value);
    if (stipulate && readFact(spec, key, v) === "unknown" && P.stipulated?.facts[key] !== undefined) v = P.stipulated.facts[key];
    const decl = spec.facts.find((f) => f.key === key);
    if (decl?.numeric) { const n = v.replace(/,/g, "").trim(); return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : null; }
    return closed && v.toLowerCase() === "unknown" && decl?.values?.includes("no") ? "no" : v;
  };
  const facts = Object.fromEntries(spec.facts.filter((f) => f.per === "case").map((f) => [f.key, val(f.key, r?.facts?.[f.key])]));
  const items = Object.fromEntries(spec.collections.map((c) => [c.key, (r?.items?.[c.key] ?? []).map((it, i) => ({
    name: typeof it.name === "string" ? it.name : `${c.item} ${i + 1}`,
    ...Object.fromEntries(spec.facts.filter((f) => f.per === c.key).map((f) => [f.key, val(f.key, it[f.key] as Answer)])) } as Item))]));
  return { facts, items, computed: {} };
}

// The agent loop: no full read. Each round, every rule that might apply names the first fact still blocking it, from
// the evaluator's own list (`because`), so a fact inside a branch the case has already settled is never asked. The
// model answers just those, reading the record as complete. Answers say whether the record states them or they
// follow from its silence, so a person can see which are assumptions. Stops when the case is decided, nothing is left
// to ask, or after 8 rounds; the reason is saved.
if (step === "agent") {
  const model = arg ?? "claude-haiku-5-5", skel: Spec = JSON.parse(read(rel("skeleton.json")));
  const draftFile = process.argv[5] ?? firstDraft();
  const spec = assemble(skel, load<{ draft: Draft }>(draftFile).draft);
  const meaning = new Map(load<{ list: FactList }>("facts.json").list.facts.map((f) => [f.key, f]));
  const byWords = new Map(spec.facts.map((f) => [f.key.replace(/_/g, " "), f.key]));   // `because` names facts in words
  const template = read("docs/experiments/public-policy/prompts/ask.md");
  const all = cases(), created = new Date().toISOString();
  const run = async (c: LabelledCase) => {
    const answers: Record<string, Answer & { source?: string; why?: string; round: number }> = {}, rounds: Record<string, unknown>[] = [];
    let res = evaluate(spec, toCase(spec, { facts: answers }, false, true)), stopped = "decided";
    for (let round = 1; res.outcome === REVIEW; round++) {
      if (round > 8) { stopped = "round cap"; break; }
      const ask = [...new Set(res.might_apply.flatMap((h) => (h.because ?? []).map((w) => byWords.get(w)!).filter((k) => k && !(k in answers)).slice(0, 1)))];
      if (!ask.length) { stopped = "nothing left to ask"; break; }
      const questions = ask.map((k) => { const f = meaning.get(k)!; return `- \`${k}\` (${(f.values ?? ["a number"]).join(" / ")}): ${f.meaning}`; }).join("\n");
      const answer = await call(template.replace("{{QUESTIONS}}", questions).replace("{{RECORD}}", c.text), model, false);
      let got: Record<string, { value?: string; source?: string; why?: string }> = {};
      try { got = parseReply(answer.reply) as never; } catch { /* an unreadable answer settles nothing */ }
      for (const k of ask) answers[k] = { ...(got[k] ?? { value: "unknown" }), round };
      rounds.push({ round, asked: ask, reply: answer.reply, usage: answer.usage });
      res = evaluate(spec, toCase(spec, { facts: answers }, false, true));
    }
    return { id: c.id, expected: c.expected, outcome: res.outcome, stopped, decided_by: res.decided_by.map((h) => h.rule), answers, rounds,
             asked: Object.keys(answers).length, from_silence: Object.values(answers).filter((a) => a.source === "silence").length };
  };
  const out = await inBatches("agent", all, run, (out) => save(`agent-${model}.json`, { created, code: codeVersion(), draft: draftFile, template_sha256: sha256(template), cases: out }));
  const n = (f: (c: Record<string, unknown>) => boolean) => out.filter(f).length;
  console.log(`right ${n((c) => c.outcome === c.expected)}/${all.length}, review ${n((c) => c.outcome === REVIEW)}, ` +
              `violations cleared ${n((c) => c.expected === P.outcomes[0] && c.outcome === P.outcomes.at(-1))}`);
}

if (step === "score") {
  const all = cases(), skel: Spec = JSON.parse(read(rel("skeleton.json")));
  const drafts = goodDrafts().map((f) => ({ f, run: load<{ draft: Draft }>(f) }));
  const readers = readdirSync(RUNS).filter((f) => f.startsWith("read-") && !f.includes("-notes"));
  const directs = readdirSync(RUNS).filter((f) => f.startsWith("direct-"));
  const rows: string[] = [], detail: Record<string, unknown>[] = [];
  // Right, split by label: a "Yes" case decided as a violation, and a "No" case decided as no violation. Resolve can
  // send a case to review and the direct answer can't, so the split shows what each one actually decided.
  const [VIOLATION, CLEAN] = [P.outcomes[0], P.outcomes.at(-1)!];
  const tally = (got: (string | null)[]) => {
    const caught = got.filter((g, i) => all[i].expected === VIOLATION && g === VIOLATION).length;
    const cleared = got.filter((g, i) => all[i].expected === CLEAN && g === CLEAN).length;
    const review = got.filter((g) => g === REVIEW).length, wrong = got.length - caught - cleared - review;
    const missed = got.filter((g, i) => all[i].expected === VIOLATION && g === CLEAN).length;  // a violation called clean
    return `${caught + cleared}/${all.length} | ${caught}/${all.filter((c) => c.expected === VIOLATION).length} | ${cleared}/${all.filter((c) => c.expected === CLEAN).length} | ${review} | ${wrong} | ${missed}`;
  };
  for (const r of readers) {
    const reads = load<{ cases: { id: string; read: Parameters<typeof toCase>[1]; error?: string }[] }>(r).cases;
    const unread = all.filter((c) => { const x = reads.find((y) => y.id === c.id); return !x || x.error || !x.read; }).map((c) => c.id);
    if (unread.length) throw new Error(`${r}: no usable read for ${unread.join(", ")}. Read them again before scoring.`);
    for (const d of drafts) {
      const spec = assemble(skel, d.run.draft!);
      for (const [stipulate, closed] of [[false, false], [false, true], [true, false], [true, true]]) {
        if (stipulate && !P.stipulated) continue;
        const got = all.map((c) => {
          const res = evaluate(spec, toCase(spec, reads.find((x) => x.id === c.id)!.read, closed, stipulate));
          detail.push({ draft: d.f, reader: r, stipulate, closed, id: c.id, expected: c.expected, outcome: res.outcome, decided_by: res.decided_by.map((h) => h.rule), might: res.might_apply.map((h) => h.rule) });
          return res.outcome;
        });
        rows.push(`| ${d.f.replace(".json", "")} | ${r.replace(/^read-|\.json$/g, "")} | ${stipulate ? "premise given, " : ""}${closed ? "closed" : "open"} | ${tally(got)} |`);
      }
    }
  }
  for (const f of readdirSync(RUNS).filter((f) => f.startsWith("agent-")).sort()) {
    const run = load<{ draft: string; cases: { id: string; outcome: string }[] }>(f);
    rows.push(`| ${run.draft.replace(".json", "")} | ${f.replace(/^agent-|\.json$/g, "")} agent loop | premise given, open | ${tally(all.map((c) => run.cases.find((x) => x.id === c.id)?.outcome ?? null))} |`);
  }
  for (const f of directs) {
    const got = load<{ cases: { id: string; answer: string | null }[] }>(f).cases;
    rows.push(`| (no spec) | ${f.replace(/^direct-|\.json$/g, "")} answers directly | n/a | ${tally(all.map((c) => { const a = got.find((x) => x.id === c.id)?.answer; return a ? P.labels[a] : null; }))} |`);
  }
  const table = ["| Draft | Reader | Unknowns | Right | Violations caught | Clean cases cleared | Review | Wrong | Missed violations (false negatives) |",
                 "| --- | --- | --- | --- | --- | --- | --- | --- | --- |", ...rows].join("\n");

  // The improve loop's half, and the agent loop: every way of deciding, on the held-out half only, with the first draft.
  const held = all.filter((c) => heldOut(c.id)), first = drafts.sort((a, b) => a.f.localeCompare(b.f))[0], spec0 = assemble(skel, first.run.draft!);
  const hrows: string[] = [];
  const hrow = (name: string, got: (c: LabelledCase) => string | null) => {
    const g = held.map(got), right = g.filter((x, i) => x === held[i].expected).length, review = g.filter((x) => x === REVIEW).length;
    const cleared = g.filter((x, i) => held[i].expected === VIOLATION && x === CLEAN).length;
    hrows.push(`| ${name} | ${right}/${held.length} | ${review} | ${held.length - right - review} | ${cleared} |`);
  };
  for (const r of readdirSync(RUNS).filter((f) => f.startsWith("read-")).sort()) {
    const reads = load<{ cases: { id: string; read: Parameters<typeof toCase>[1] }[] }>(r).cases;
    const name = r.replace(/^read-|\.json$/g, "");
    for (const stipulate of [false, true]) {
      if (stipulate && !P.stipulated) continue;
      hrow(`${name} reads${stipulate ? ", premise given" : ""}`, (c) => evaluate(spec0, toCase(spec0, reads.find((x) => x.id === c.id)?.read ?? null, false, stipulate)).outcome);
    }
  }
  for (const f of readdirSync(RUNS).filter((f) => f.startsWith("agent-")).sort()) {
    const got = load<{ cases: { id: string; outcome: string }[] }>(f).cases;
    hrow(`${f.replace(/^agent-|\.json$/g, "")} agent loop, premise given`, (c) => got.find((x) => x.id === c.id)?.outcome ?? null);
  }
  for (const f of directs) {
    const got = load<{ cases: { id: string; answer: string | null }[] }>(f).cases;
    hrow(`${f.replace(/^direct-|\.json$/g, "")} answers directly`, (c) => { const a = got.find((x) => x.id === c.id)?.answer; return a ? P.labels[a] : null; });
  }
  const htable = ["| How | Right | Review | Wrong | Missed violations (false negatives) |", "| --- | --- | --- | --- | --- |", ...hrows].join("\n");
  writeFileSync(join(DIR, "results.md"), `# Results\n\n${all.length} labelled cases. "Open": an unknown fact stays unknown (Resolve's rule). "Closed": an unknown yes/no fact reads as no. "Premise given": ${P.stipulated?.why ?? ""}\n\n${table}\n\n` +
    `## The held-out half\n\n${held.length} cases (every other case in sorted ID order) that the improve loop never saw, decided by ${first.f.replace(".json", "")}. A reader named "-notes-v1-md" read them with the notes Claude wrote from the other half.\n\n${htable}\n`);
  save("score.json", detail);
  console.log(table);
}
if (step === "pack") console.log(`packed ${pack(DIR)} runs into ${rel("runs.json.gz")}`);
await shutdown();
