// What one answer to a finding would do, worked out before the owner picks it. Each option carries the spec edit
// Claude wrote for it (core/spec-edit.ts); this applies the edit and asks the same questions a person would:
// does the edit hold together, does the finding go away, does it raise a new one, which kinds of case decide
// differently (Z3, over every case), and which past cases flip (the evaluator, on each one).
import { type Case, evaluate, words } from "./evaluate.ts";
import { applyEdits, textProblems, type SpecEdit } from "./spec-edit.ts";
import type { Outcome, Spec } from "./spec.ts";
import { checkSop, diffCoverage, diffSpecs, exampleFacts, factsOf, findingMeaning, type Finding } from "./sop-checks.ts";
import { domains } from "./z3.ts";


// A case decided before, as the pack hands it over: its facts in the evaluator's shape, and what the team decided.
// The decision is evidence, not ground truth (principle 8): a flip is shown for a person to judge.
export type PastCase = { id: string; name: string; decision: Outcome | null; case: Case };

export type OptionEdits = { option: string; says: string; edits: SpecEdit[] };

// A kind of case that decides differently, with one made-up example from Z3.
// Its example_facts read back as a case with exampleCase; read_by_change marks what the edited rules read.
export type Change = { from: Outcome; to: Outcome; example: string; example_facts: (Finding["example_facts"][number] & { read_by_change?: true })[] };

export type Impact = {
  option: string;
  problems: string[];            // why the edit can't be used; when present, nothing below is filled
  keeps_rules: boolean;          // the option changes nothing: the owner accepts the rules as they are
  resolves: boolean;             // Z3 no longer reports the finding, nor one of its kind on its SOP sections
  new_findings: { id: string; title: string }[];   // findings that weren't there before, by what they say
  changes: Change[];             // every kind of case that decides differently, among the cases searched
  searched_items_per_list: number | null;   // null: the search covered every case; else every case with up to this many items in each list
  flips: { case_id: string; name: string; from: Outcome; to: Outcome }[];
  matches_past: number | null;   // past cases whose team decision the edited rules give; null when none has one
  past_decided: number;          // how many past cases have a team decision, which matches_past is out of
  ms: number;
};


// The rules an edit could change the outcome of: the ones it touches, or every rule when it changes the order,
// the outcome for unknowns, who counts or a list. Used only to pick which facts an example shows.
function touched(a: Spec, b: Spec) {
  const same = (x: Spec) => JSON.stringify([x.order, x.unknowns, x.collections, x.lists]);
  if (same(a) !== same(b)) return { a: a.rules.map((r) => r.id), b: b.rules.map((r) => r.id) };
  const before = new Map(a.rules.map((r) => [r.id, JSON.stringify(r)]));
  const after = new Map(b.rules.map((r) => [r.id, JSON.stringify(r)]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id));
  return { a: ids.filter((id) => before.has(id)), b: ids.filter((id) => after.has(id)) };
}

// The SOP sections that decide a case's outcome, with their sentences, for what a person reads. Only rules that apply
// decide. A case held back because a rule only might apply is decided by the unknowns section, not by that rule; a
// case no rule touches gets the order's last outcome, which the order section sets.
export function deciding(s: Spec, c: Case): { sop: string; text: string }[] {
  const r = evaluate(s, c);
  const hits = r.applied.filter((h) => h.then === r.outcome);
  if (hits.length) return [...new Map(hits.map((h) => [h.sop + h.text, { sop: h.sop, text: h.text }])).values()];
  if (r.might_apply.length && r.outcome === s.unknowns.then) return [{ sop: s.unknowns.sop, text: s.unknowns.text }];
  return [{ sop: s.order_sop, text: `No rule applies, so the case is ${words(r.outcome)}.` }];
}
export const decidingSections = (s: Spec, c: Case) => [...new Set(deciding(s, c).map((d) => d.sop))];

type Example = Awaited<ReturnType<typeof diffSpecs>>[number]["example"];
const asCase = (c: Example): Case => ({ facts: c.facts, computed: c.computed,
  items: Object.fromEntries(Object.entries(c.items).map(([list, xs]) => [list, xs && xs.map((x, i) => ({ name: `${list} ${i + 1}`, ...x }))])) });

// An example as the pane shows it, read back as a case: every fact it doesn't list is unknown, a list it gives a
// count for has that many items (their unlisted facts unknown), and a list it gives no count for isn't given.
export function exampleCase(s: Spec, facts: Finding["example_facts"]): Case {
  const computed = new Set(s.computed.map((c) => c.key));
  const numeric = new Set([...s.facts, ...s.computed].filter((f) => f.numeric).map((f) => f.key));
  const value = (f: Finding["example_facts"][number]) => numeric.has(f.key) && f.value !== "unknown" ? Number(f.value) : f.value;
  const c: Example = { facts: {}, computed: {}, items: Object.fromEntries(s.collections.map((x) => [x.key, null])) };
  for (const f of facts) if (f.list && f.item === undefined && f.value !== "not given") c.items[f.list] = Array.from({ length: Number(f.value) }, () => ({}));
  for (const f of facts) {
    if (f.list && f.item !== undefined) c.items[f.list]![f.item - 1][f.key] = value(f);
    else if (!f.list) (computed.has(f.key) ? c.computed : c.facts)[f.key] = value(f);
  }
  return asCase(c);
}

// Z3's example, cut down to what makes it flip. The evaluator does the cutting on concrete cases: drop lists and
// items, then make each fact unknown, keeping every cut that still flips, so of two facts that each would set off a
// rule only one is left. What is left is shown whole: every known fact and how many items each list has, so the
// example read back (exampleCase) flips exactly as stated; that is checked before it is shown. An unknown is
// listed only where it matters, since reading back makes every unlisted fact unknown anyway. `read_by_change`
// marks what the edited rules read, which the sentence leads with.
function essentials(a: Spec, b: Spec, d: { from: Outcome; to: Outcome; example: Example }, keys: Set<string>) {
  const flipsAs = (c: Case) => evaluate(a, c).outcome === d.from && evaluate(b, c).outcome === d.to;
  const ex = structuredClone(d.example);
  const tryCut = (cut: (c: Example) => void) => { const c = structuredClone(ex); cut(c); if (flipsAs(asCase(c))) Object.assign(ex, c); };
  if (!flipsAs(asCase(ex))) throw new Error(`Z3's example for ${d.from} becoming ${d.to} doesn't flip in the evaluator; this is a bug in Resolve.`);
  for (const list of Object.keys(ex.items)) {
    tryCut((c) => { c.items[list] = null; });
    for (let i = (ex.items[list]?.length ?? 0) - 1; i >= 0; i--) tryCut((c) => { c.items[list]!.splice(i, 1); });
  }
  const unknown = "unknown";
  for (const k of Object.keys(ex.facts)) tryCut((c) => { c.facts[k] = unknown; });
  for (const k of Object.keys(ex.computed)) tryCut((c) => { c.computed[k] = unknown; });
  for (const [list, xs] of Object.entries(ex.items)) (xs ?? []).forEach((x, i) => {
    for (const k of Object.keys(x)) tryCut((c) => { c.items[list]![i][k] = unknown; });
  });

  const all = new Set([...Object.keys(ex.facts), ...Object.keys(ex.computed), ...Object.values(ex.items).flatMap((xs) => (xs ?? []).flatMap(Object.keys))]);
  const counts: Finding["example_facts"] = Object.entries(ex.items).flatMap(([list, xs]) => xs ? [{ key: list, name: words(list), value: String(xs.length), list }] : []);
  // A list not given is read back as not given anyway; it is shown only when giving it empty would stop the flip.
  const notGiven = (list: string) => { const c = structuredClone(ex); c.items[list] = []; return !flipsAs(asCase(c)); };
  // An unknown the edited rules read is shown too when knowing it would stop the flip: it is often the point.
  const dom = domains(a, [b]);
  const matters = (f: Finding["example_facts"][number]) => keys.has(f.key) && (dom[f.key]?.labels ?? [0, 100]).filter((v) => String(v) !== unknown).some((v) => {
    const c = structuredClone(ex);
    if (f.list) c.items[f.list]![f.item! - 1][f.key] = v; else if (f.key in c.facts) c.facts[f.key] = v; else c.computed[f.key] = v;
    return !flipsAs(asCase(c));
  });
  const facts = [...counts, ...exampleFacts(ex, all).filter((f) => f.list && f.item === undefined ? notGiven(f.list) : f.value !== unknown || matters(f))]
    .map((f) => ({ ...f, ...(keys.has(f.key) || (f.list && f.item === undefined && keys.has(`list:${f.list}`)) ? { read_by_change: true as const } : {}) }));
  if (!flipsAs(exampleCase(a, facts))) throw new Error(`The cut-down example for ${d.from} becoming ${d.to} doesn't flip when read back; this is a bug in Resolve.`);
  return facts;
}

// Kinds of case that decide differently between two versions, each with an example case a person can read. The
// search covers every case, or where that would be too slow every case with up to diffCoverage(a, b) items in each
// list, so "none" means none of those.
export async function changes(a: Spec, b: Spec): Promise<Change[]> {
  const t = touched(a, b);
  const keys = new Set([...factsOf(a, t.a), ...factsOf(b, t.b)]);
  const by = (s: Spec, c: Case) => ` (${decidingSections(s, c).join(", ")})`;
  const item = (list: string) => a.collections.find((c) => c.key === list)?.item ?? list;
  const say = (f: Finding["example_facts"][number]) => {
    if (f.list && f.item === undefined) {
      if (f.value === "not given") return `the ${words(f.list)} aren't given`;
      const n = Number(f.value);
      return n ? `${n} ${item(f.list)}${n === 1 ? " is" : "s are"} listed` : `no ${item(f.list)}s are listed`;
    }
    return `${words(f.name)}${f.item ? ` for ${item(f.list!)} ${f.item}` : ""} is ${f.value === "unknown" ? "unknown" : `"${f.value}"`}`;
  };
  return (await diffSpecs(a, b)).map((d) => {
    const facts = essentials(a, b, d, keys), c = exampleCase(a, facts);
    const main = facts.filter((f) => f.read_by_change), rest = facts.length - main.length;
    const lead = main.map(say).join(" and ") || (facts.length ? facts.map(say).join(" and ") : "nothing about the case is known");
    const others = main.length && rest ? ` (and ${rest} other ${rest === 1 ? "fact is" : "facts are"} as listed)` : "";
    return { from: d.from, to: d.to, example_facts: facts,
             example: `When ${lead}${others}, and everything else is unknown, the case now comes out ${words(d.from)}${by(a, c)} and would come out ${words(d.to)}${by(b, c)}.` };
  });
}

// Past cases whose outcome differs between two versions.
export function flips(a: Spec, b: Spec, past: PastCase[]) {
  return past.flatMap((p) => {
    const from = evaluate(a, p.case).outcome, to = evaluate(b, p.case).outcome;
    return from === to ? [] : [{ case_id: p.id, name: p.name, from, to }];
  });
}

// `sop` is the SOP's text, to check that every rule an edit writes quotes it.
export async function optionImpact(spec: Spec, finding: Pick<Finding, "id" | "kind" | "sop_refs">, option: OptionEdits, past: PastCase[], sop: string): Promise<Impact> {
  const start = performance.now();
  const decided = past.filter((p) => p.decision !== null);
  const base = { option: option.option, keeps_rules: !option.edits?.length, resolves: false, new_findings: [], changes: [], searched_items_per_list: null as number | null,
                 flips: [], matches_past: null, past_decided: decided.length };
  const done = (x: Omit<Impact, "ms">): Impact => ({ ...x, ms: Math.round(performance.now() - start) });
  if (!Array.isArray(option.edits)) return done({ ...base, problems: ["The option has no list of edits."] });
  const applied = applyEdits(spec, option.edits), edited = applied.spec;
  const problems = [...applied.problems, ...textProblems(option.edits, sop)];
  if (problems.length) return done({ ...base, problems });
  // Findings are compared by what they say, not by id: two can share an id, and a rule renamed with the same
  // problem is the same problem.
  const before = new Set((await checkSop(spec)).map(findingMeaning));
  const after = await checkSop(edited);
  const sameKind = (f: Finding) => f.kind === finding.kind && JSON.stringify([...f.sop_refs].sort()) === JSON.stringify([...finding.sop_refs].sort());
  return done({
    ...base, problems: [],
    resolves: !after.some((f) => f.id === finding.id || sameKind(f)),
    new_findings: after.filter((f) => !before.has(findingMeaning(f))).map((f) => ({ id: f.id, title: f.title })),
    changes: option.edits.length ? await changes(spec, edited) : [],
    searched_items_per_list: option.edits.length ? diffCoverage(spec, edited) : null,
    flips: flips(spec, edited, past),
    matches_past: decided.length ? decided.filter((p) => evaluate(edited, p.case).outcome === p.decision).length : null,
  });
}
