// A spike: run a public regulation and someone else's labelled cases through drafting, end to end.
//   node experiments/public-policy/run.ts <policy> facts            Claude lists the facts the procedure needs
//   node experiments/public-policy/run.ts <policy> draft [n]        Claude drafts the spec n times; every check runs on each
//   node experiments/public-policy/run.ts <policy> read [model]     a model fills in the facts from each case's text
//   node experiments/public-policy/run.ts <policy> direct [model]   the baseline: a model answers each case itself
//   node experiments/public-policy/run.ts <policy> score            the drafts on the cases, against the labels
// Each step saves its calls whole in experiments/public-policy/<policy>/runs/. Nothing here changes the core or a
// pack: the drafting prompt, its checks, Z3 and the evaluator are the ones KYB and expenses use.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../../core/load.ts";
import { evaluate, type Case, type Item } from "../../core/evaluate.ts";
import { checkSop } from "../../core/sop-checks.ts";
import type { FactDecl, Spec } from "../../core/spec.ts";
import { shutdown } from "../../core/z3.ts";
import { assemble, buildPrompt, draftProblems, parseReply, sha256, type Draft } from "../../drafting/draft-spec.ts";
import { ask, codeVersion, request } from "../../drafting/propose-spec.ts";

const [policy, step, arg] = process.argv.slice(2);
const DIR = join(ROOT, "experiments/public-policy", policy ?? "");
if (!policy || !existsSync(join(DIR, "policy.json"))) { console.error("Usage: run.ts <policy> facts|draft|read|direct|score"); process.exit(1); }
const RUNS = join(DIR, "runs");
mkdirSync(RUNS, { recursive: true });
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const rel = (f: string) => `experiments/public-policy/${policy}/${f}`;
const save = (name: string, x: unknown) => writeFileSync(join(RUNS, name), JSON.stringify(x, null, 2) + "\n");
const load = <T>(name: string): T => JSON.parse(readFileSync(join(RUNS, name), "utf8"));

// What the policy folder gives: the SOP, the outcomes, and the labelled cases with the outcome each label means.
// `stipulated`: facts every case's text states as a premise in words no reader maps to a fact ("is a telemarketer
// subject to the Telemarketing Sales Rule"), named by the keys of the fact list Claude wrote. Scored as its own reading.
type Policy = { domain: string; sop: string; revision: string; outcomes: string[]; cases: { file: string; id: string; text: string; label: string; split: string }[];
                labels: Record<string, string>; stipulated?: { why: string; facts: Record<string, string> } };
const P: Policy = JSON.parse(readFileSync(join(DIR, "policy.json"), "utf8"));
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
           unknowns: { sop: "", text: "", then: P.outcomes[1] },
           facts: f.facts.map(({ key, per, values, numeric }) => ({ key, per, ...(values ? { values } : {}), ...(numeric ? { numeric } : {}) })),
           collections: f.collections.map(({ key, item }) => ({ key, item })), computed: [], lists: {}, rules: [] };
}

if (step === "facts") {
  const prompt = read("experiments/public-policy/prompts/sop-to-facts.md").replace("{{OUTCOMES}}", P.outcomes.map((o) => `"${o}"`).join(", ")).replace("{{SOP}}", sop.trim());
  const model = arg ?? "claude-opus-5-5";
  const answer = await call(prompt, model, true);
  const list = parseReply(answer.reply) as unknown as FactList;
  save("facts.json", { created: new Date().toISOString(), code: codeVersion(), model, effort, prompt, ...answer, list });
  writeFileSync(join(DIR, "vocabulary.md"), vocabulary(list));
  writeFileSync(join(DIR, "skeleton.json"), JSON.stringify(skeleton(list), null, 2) + "\n");
  console.log(`${list.facts.length} facts, ${list.collections.length} lists. Wrote vocabulary.md and skeleton.json.`);
}

if (step === "draft") {
  const skel: Spec = JSON.parse(read(rel("skeleton.json")));
  const prompt = buildPrompt(read("prompts/sop-to-spec.md"), { specTs: read("core/spec.ts"), vocabulary: read(rel("vocabulary.md")), approved: skel, sop });
  const n = Number(arg ?? 1), model = "claude-opus-5-5";
  await Promise.all(Array.from({ length: n }, async (_, i) => {
    const answer = await call(prompt, model, true);
    const run: Record<string, unknown> = { created: new Date().toISOString(), code: codeVersion(), model, effort, prompt, ...answer };
    const id = `draft-${sha256(answer.reply).slice(0, 6)}`;
    save(`${id}.json`, run);
    try {
      const draft = parseReply(answer.reply);
      const problems = draftProblems(skel, draft, sop);
      // Z3's checks need a spec that loads; a draft with problems gets its problems and nothing else.
      const findings = problems.length ? [] : (await checkSop(assemble(skel, draft))).map(({ id, kind, title, sop_refs, rule_ids }) => ({ id, kind, title, sop_refs, rule_ids }));
      Object.assign(run, { draft, problems, needs: draft.needs ?? [], findings });
      console.log(`${id} (${i + 1}/${n}): ${draft.rules.length} rules, ${problems.length} problems, ${findings.length} Z3 findings, ${(draft.needs ?? []).length} needs`);
    } catch (e) { run.error = (e as Error).message; console.log(`${id}: ${run.error}`); }
    save(`${id}.json`, run);
  }));
}

if (step === "read") {
  const model = arg ?? "claude-haiku-5-5";
  const template = read("experiments/public-policy/prompts/read-case.md").replace("{{VOCABULARY}}", read(rel("vocabulary.md")).replace(/^# .*\n+.*\n+/, "").trim());
  const all = cases(), out: Record<string, unknown>[] = [];
  for (let i = 0; i < all.length; i += 8) {
    out.push(...await Promise.all(all.slice(i, i + 8).map(async (c) => {
      const answer = await call(template.replace("{{RECORD}}", c.text), model, false);
      let read: unknown = null, error: string | undefined;
      try { read = parseReply(answer.reply); } catch (e) { error = (e as Error).message; }
      return { id: c.id, model, ...answer, read, ...(error ? { error } : {}) };
    })));
    console.log(`read ${Math.min(i + 8, all.length)}/${all.length}`);
  }
  save(`read-${model}.json`, { created: new Date().toISOString(), code: codeVersion(), template_sha256: sha256(template), cases: out });
}

if (step === "direct") {
  const model = arg ?? "claude-haiku-5-5";
  const all = cases(), out: Record<string, unknown>[] = [];
  // The baseline gets the same text the drafting step got, minus our section 1, and answers as LegalBench asks.
  const rule = sop.slice(sop.indexOf("## 2."));
  for (let i = 0; i < all.length; i += 8) {
    out.push(...await Promise.all(all.slice(i, i + 8).map(async (c) => {
      const prompt = `${rule.trim()}\n\nQuestion: ${c.text}\nAnswer with one word, Yes or No.`;
      const answer = await call(prompt, model, false);
      return { id: c.id, model, ...answer, answer: /\byes\b/i.test(answer.reply) ? "Yes" : /\bno\b/i.test(answer.reply) ? "No" : null };
    })));
  }
  save(`direct-${model}.json`, { created: new Date().toISOString(), code: codeVersion(), cases: out });
  console.log(`${out.filter((c) => c.answer === all.find((x) => x.id === c.id)!.label).length}/${all.length} match the labels`);
}

// A case as the evaluator sees it, from a reader's answers. Closed world reads "unknown" as "no" for a yes/no fact:
// what a benchmark's fact pattern means by leaving something out, and what Resolve never does on its own.
type Answer = { value?: unknown; quote?: string };
function toCase(spec: Spec, r: { facts?: Record<string, Answer>; items?: Record<string, Record<string, Answer | string>[]> } | null, closed: boolean, stipulate: boolean): Case {
  const val = (key: string, a: Answer | undefined) => {
    const v = a?.value === undefined || a?.value === null ? "unknown" : String(a.value);
    const decl = spec.facts.find((f) => f.key === key);
    if (decl?.numeric) return v === "unknown" ? null : Number(v);
    return closed && v.toLowerCase() === "unknown" && decl?.values?.includes("no") ? "no" : v;
  };
  const facts = Object.fromEntries(spec.facts.filter((f) => f.per === "case").map((f) => [f.key, val(f.key, r?.facts?.[f.key])]));
  if (stipulate) Object.assign(facts, P.stipulated?.facts ?? {});
  const items = Object.fromEntries(spec.collections.map((c) => [c.key, (r?.items?.[c.key] ?? []).map((it, i) => ({
    name: typeof it.name === "string" ? it.name : `${c.item} ${i + 1}`,
    ...Object.fromEntries(spec.facts.filter((f) => f.per === c.key).map((f) => [f.key, val(f.key, it[f.key] as Answer)])) } as Item))]));
  return { facts, items, computed: {} };
}

if (step === "score") {
  const all = cases(), skel: Spec = JSON.parse(read(rel("skeleton.json")));
  const drafts = readdirSync(RUNS).filter((f) => f.startsWith("draft-")).map((f) => ({ f, run: load<{ draft?: Draft; problems?: string[] }>(f) }))
    .filter((d) => d.run.draft && !d.run.problems?.length);
  const readers = readdirSync(RUNS).filter((f) => f.startsWith("read-"));
  const directs = readdirSync(RUNS).filter((f) => f.startsWith("direct-"));
  const rows: string[] = [], detail: Record<string, unknown>[] = [];
  const tally = (got: string[]) => {
    const right = got.filter((g, i) => g === all[i].expected).length, review = got.filter((g) => g === P.outcomes[1]).length;
    const wrong = got.length - right - review;
    const missed = got.filter((g, i) => all[i].expected === P.outcomes[0] && g === P.outcomes.at(-1)).length;  // violation cleared
    return { right, review, wrong, missed };
  };
  for (const r of readers) {
    const reads = load<{ cases: { id: string; read: Parameters<typeof toCase>[1] }[] }>(r).cases;
    for (const d of drafts) {
      const spec = assemble(skel, d.run.draft!);
      for (const [stipulate, closed] of [[false, false], [false, true], [true, false], [true, true]]) {
        if (stipulate && !P.stipulated) continue;
        const got = all.map((c) => {
          const res = evaluate(spec, toCase(spec, reads.find((x) => x.id === c.id)?.read ?? null, closed, stipulate));
          detail.push({ draft: d.f, reader: r, stipulate, closed, id: c.id, expected: c.expected, outcome: res.outcome, decided_by: res.decided_by.map((h) => h.rule), might: res.might_apply.map((h) => h.rule) });
          return res.outcome;
        });
        const t = tally(got);
        rows.push(`| ${d.f.replace(".json", "")} | ${r.replace(/^read-|\.json$/g, "")} | ${stipulate ? "premise given, " : ""}${closed ? "closed" : "open"} | ${t.right}/${all.length} | ${t.review} | ${t.wrong} | ${t.missed} |`);
      }
    }
  }
  for (const f of directs) {
    const got = load<{ cases: { id: string; answer: string | null }[] }>(f).cases;
    const right = all.filter((c) => got.find((x) => x.id === c.id)?.answer === c.label).length;
    const missed = all.filter((c) => c.label === "Yes" && got.find((x) => x.id === c.id)?.answer === "No").length;
    rows.push(`| (no spec) | ${f.replace(/^direct-|\.json$/g, "")} answers directly | n/a | ${right}/${all.length} | 0 | ${all.length - right} | ${missed} |`);
  }
  const table = ["| Draft | Reader | Unknowns | Right | Review | Wrong | Violations cleared |", "| --- | --- | --- | --- | --- | --- | --- |", ...rows].join("\n");
  writeFileSync(join(DIR, "results.md"), `# Results\n\n${all.length} labelled cases. "Open": an unknown fact stays unknown (Resolve's rule). "Closed": an unknown yes/no fact reads as no. "Premise given": ${P.stipulated?.why ?? ""}\n\n${table}\n`);
  save("score.json", detail);
  console.log(table);
}
await shutdown();
