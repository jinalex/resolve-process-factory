// Checks on the SOP itself, run once per spec version. Each check asks Z3 a question about every possible case.
// Findings come out in the shape the pane's Spec tab reads (spec.json "findings"). Claude adds the question
// and options for the expert in a later step; Z3 supplies everything else.
//
// The checks don't hand Z3 the whole SOP for every question. core/slice.ts splits the rules into groups that
// read none of the same facts; Z3 works out, once per group, which outcomes the group can reach, and each
// question then asks Z3 only about the group of the rule it is about. The other groups come in as those
// lists of outcomes. So a question costs about the size of its group, not of the SOP, and adding an
// unrelated section to the SOP adds questions about that section only. Answers are kept by the group's
// content, so after a one-rule change only that rule's group is asked again.
import { type Case, evaluate } from "./evaluate.ts";
import { type Group, type Grouping, repsOf, seenAs, slice, splitSize, subSpec } from "./slice.ts";
import { type Spec, validateSpec } from "./spec.ts";
import { type B, type Domain, domains, Encoder, type I, type Num, type SymCase, z3Context } from "./z3.ts";

export type Finding = {
  id: string;
  kind: "contradiction" | "unknowns" | "gap" | "uncovered" | "judgment";
  rule_ids: string[];
  sop_refs: string[];
  title: string;
  example: string | null;
  example_facts: { key: string; name: string; value: string; list?: string; item?: number }[];  // item counts from 1
  explain: string;
  proof: { asks: string; code: string; answer: "sat" | "unsat" | "unknown"; ms: number };
};

// A finding means the same thing when Z3 says the same about the same rules. Timings and the solver's choice of
// example case don't change its meaning; its id alone doesn't fix it, since two findings can share one.
export const findingMeaning = (f: Record<string, unknown>) => JSON.stringify([f.kind, f.title, f.explain, f.sop_refs, f.rule_ids]);


// How to group the rules (core/slice.ts); only tests and the benchmark change it. `slots` looks at cases with up
// to that many items in each list instead of every case, and the proofs say so.
export type Options = { groups?: Grouping; slots?: number };

type Example = ReturnType<Encoder["readCase"]>;
type Answer = "sat" | "unsat" | "unknown";

const name = (k: string) => k.replace(/_/g, " ");
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// How many items each list needs for Z3 to cover every case, not just small ones. A "some item" condition needs
// one item to make it hold or leave it unknown (its witness), "no item" conditions only get easier as items are
// dropped, and one item that certainly counts keeps a list from looking empty. So if a case exists at all, one
// exists with a witness for each "some" condition plus that one item. The checks count only the conditions of the
// group a question is about, so the bound doesn't grow with the SOP.
// Checks that compare two copies of a case need fewer than twice that:
// - "completes" (a case and the same case once its unknowns are known): a condition that holds stays holding once
//   more is known, so one witness serves both copies, unless the condition asks whether a fact is unknown (that
//   can stop holding once it's known): then each copy may need its own.
// - "differ" (two cases that differ only in the first item, or in a case fact): every other item is the same in
//   both, so it serves both; the first item is kept, and each copy may need its own item that counts.
// A list that is added up (`sum_over`) is different: reaching a total can take many items when each must stay
// under a threshold, and no count of conditions bounds that. Each sum gets one more item here, enough for KYB's
// sum (any share it needs can sit on one excluded owner, or in the unaccounted share), but a check of a group that
// adds a list up says how many items it looked at (see slotsFor).
const SUMMED_ITEMS = 3;
// Past this many items Z3 can take minutes on one group (KYB's ten rules about people, once who counts ties them
// together: the unknowns check took 3 s with 2 people, 44 s with 8 and 8 minutes with 10). A group that needs
// more is checked with this many, and the proofs say so instead of claiming every case.
const MAX_SLOTS = { one: 12, differ: 12, completes: 6 } as const;
export function slotsNeeded(specs: Spec[], kind: "one" | "completes" | "differ") {
  let n = 0, twice = 0, sums = false, keepers = 0;
  const asksUnknown = (c: object | undefined) => !!c && JSON.stringify(c).includes('"is_unknown"');
  for (const s of specs) {
    const lists = new Map(s.collections.map((c) => [c.key, c]));
    const walk = (c: object) => {
      for (const [k, v] of Object.entries(c)) {
        if (k === "some") { n++; if (asksUnknown((c as { where: object }).where) || asksUnknown(lists.get(v as string)?.counts_when)) twice++; }
        if (k === "sum_over") { n++; sums = true; }
        if (typeof v === "object" && v) walk(v);
      }
    };
    s.rules.forEach((r) => walk(r.when));
    s.collections.forEach((c) => { if (c.empty_ok_when) walk(c.empty_ok_when); if (c.counts_when) walk(c.counts_when); });
    s.computed.forEach((c) => c.sum && walk(c.sum));
    keepers += kind === "one" ? 1 : kind === "differ" ? 2 : s.collections.some((c) => asksUnknown(c.counts_when)) ? 2 : 1;
  }
  const need = n + (kind === "completes" ? twice : 0) + (kind === "differ" ? 1 : 0) + keepers;
  return Math.max(sums ? SUMMED_ITEMS : 1, need);
}

// The fewest items any question of a check looked at, where that was fewer than every case needs: when the caller
// set the number, when MAX_SLOTS capped it, or when the group adds a list up (no number covers every case there).
type Bounded = Partial<Record<"one" | "completes" | "differ", number>>;
function slotsFor(specs: Spec[], kind: keyof Bounded, opts: Options, bounded: Bounded) {
  const sums = specs.some((s) => JSON.stringify([s.rules, s.collections, s.computed]).includes('"sum_over"'));
  const n = opts.slots ?? Math.min(slotsNeeded(specs, kind), MAX_SLOTS[kind]);
  if (opts.slots || sums || n < slotsNeeded(specs, kind)) bounded[kind] = Math.min(bounded[kind] ?? Infinity, n);
  return n;
}

// What a proof covers: every case, or cases with up to so many items in each list.
const upTo = (spec: Spec, bounded: Bounded, kinds: (keyof Bounded)[]) => {
  if (!spec.collections.length) return "";
  const n = Math.min(...kinds.map((k) => bounded[k] ?? Infinity));
  return n < Infinity ? ` with up to ${n} items in each list` : " (with any number of items)";
};

function assertValid(spec: Spec) {
  const problems = validateSpec(spec);
  if (problems.length) throw new Error(`The spec has problems; fix them before running Z3:\n${problems.join("\n")}`);
}

// Z3's example case, run through the evaluator. The two are separate copies of the rules, so an example
// whose outcome they disagree on is a bug here, not a finding.
function replay(spec: Spec, c: Example, expect: (outcome: string) => boolean, what: string) {
  const kase: Case = { facts: c.facts, computed: c.computed,
    items: Object.fromEntries(Object.entries(c.items).map(([list, xs]) => [list, xs && xs.map((x, i) => ({ name: `${list} ${i + 1}`, ...x }))])) };
  const { outcome } = evaluate(spec, kase);
  if (!expect(outcome)) throw new Error(`Z3 and the evaluator disagree on the example for ${what}: the evaluator says ${outcome}.`);
}

// A plain list of the facts in an example case that differ from a clean case, so the example is short.
export function exampleFacts(c: Example, keys: Set<string>) {
  const out: Finding["example_facts"] = [];
  for (const [k, v] of Object.entries(c.facts)) if (keys.has(k)) out.push({ key: k, name: name(k), value: String(v) });
  for (const [list, items] of Object.entries(c.items)) if (items === null) out.push({ key: list, name: name(list), value: "not given", list });
  for (const [list, items] of Object.entries(c.items)) (items ?? []).forEach((x, i) => {
    for (const [k, v] of Object.entries(x)) if (keys.has(k)) out.push({ key: k, name: name(k), value: String(v), list, item: i + 1 });
  });
  for (const [k, v] of Object.entries(c.computed)) if (keys.has(k)) out.push({ key: k, name: name(k), value: String(v) });
  return out;
}

export const factsOf = (spec: Spec, ruleIds: string[]) => {
  const keys = new Set<string>();
  const lists = new Map(spec.collections.map((c) => [c.key, c]));
  const walk = (c: object) => {
    for (const [k, v] of Object.entries(c)) {
      if (k === "fact" || k === "computed" || k === "of") keys.add(v as string);
      else if ((k === "some" || k === "sum_over") && !keys.has(`list:${v}`)) {
        keys.add(`list:${v}`);
        const col = lists.get(v as string);
        if (col?.counts_when) walk(col.counts_when);
        if (col?.empty_ok_when) walk(col.empty_ok_when);
      } else if (typeof v === "object" && v) walk(v);
    }
  };
  spec.rules.filter((r) => ruleIds.includes(r.id)).forEach((r) => walk(r.when));
  // A rule also reads what decides who counts in the lists it looks at, and what the spec's own sums add up.
  for (let size = -1; size !== keys.size;) {
    size = keys.size;
    for (const c of spec.computed) if (keys.has(c.key) && c.sum) walk(c.sum);
  }
  return keys;
};

// --- Asking one group ---

// One group's question: symbolic copies of a case (two when a check compares cases), each copy's outcome
// under the group's rules, and one solver that keeps what it learns from question to question.
type Part = { enc: Encoder; sub: Spec; cases: SymCase[]; outs: I[]; runs: ReturnType<Encoder["run"]>[]; solver: InstanceType<Encoder["ctx"]["Solver"]> };

// Items are interchangeable, so a question only needs to look at them in one order: sorted by their facts in the
// first copy of the case (the copies' items move together). Without this Z3 tries every order of the same people
// before it can say "no such case", which with a dozen slots is most of its time. `from` leaves the first items
// where they are, for a check that pins something on them.
function sorted(enc: Encoder, s: SymCase, from: number): B[] {
  const { And, Or, Implies } = enc.ctx;
  const le = (x: Record<string, I>, y: Record<string, I>, ks: string[]): B =>
    ks.length ? Or(x[ks[0]].lt(y[ks[0]]), And(x[ks[0]].eq(y[ks[0]]), le(x, y, ks.slice(1)))) : enc.ctx.Bool.val(true);
  return Object.values(s.items).flatMap((slots) => slots.slice(from + 1).map((slot, i) =>
    Implies(slot.present, le(slots[from + i].facts, slot.facts, Object.keys(slot.facts).sort()))));
}

function part(enc: Encoder, cases: SymCase[], runs: ReturnType<Encoder["run"]>[], link: B[] = [], from = 0): Part {
  const solver = new enc.ctx.Solver();
  for (const c of [...cases.flatMap((s) => s.domain), ...link, ...sorted(enc, cases[0], from)]) solver.add(c);
  return { enc, sub: enc.spec, cases, outs: runs.map((r) => r.outcome), runs, solver };
}

async function check(p: Part, extra: B[]): Promise<{ answer: Answer; ms: number; model: Parameters<Encoder["readCase"]>[0] | null }> {
  p.solver.push();
  for (const c of extra) p.solver.add(c);
  const t = performance.now();
  const answer = (await p.solver.check()) as Answer;
  const model = answer === "sat" ? (p.solver.model() as unknown as Parameters<Encoder["readCase"]>[0]) : null;
  p.solver.pop();
  return { answer, ms: Math.round(performance.now() - t), model };
}

// Every combination of outcomes the copies can come out with, for each way the group's split-on facts can be
// fixed (`at`, see pickKey), with one example case for each. `complete` is false if Z3 gave up, in which case a
// combination that isn't listed hasn't been ruled out.
type Reach = { t: number[]; at: string; ex: () => Example[] };
type Reachable = { found: Reach[]; complete: boolean; ms: number };

async function reachable(p: Part, g: Group, extra: B[]): Promise<Reachable> {
  const { And, Not, If, Int } = p.enc.ctx;
  // The split-on facts as numbers, copy by copy, in the order pickKey lists them.
  const fixed = p.cases.flatMap((s) => g.split.map((atom) => {
    const key = atom.slice(atom.indexOf(":") + 1);
    if (atom.startsWith("items:")) return If(s.items[key][0].present, Int.val(1), Int.val(0)) as I;
    return atom.startsWith("fact:") ? s.facts[key] : s.computed[key];
  }));
  const outs = [...p.outs, ...fixed], n = g.split.length;
  p.solver.push();
  for (const c of [...extra, ...told(p, g)]) p.solver.add(c);
  const found: Reach[] = [];
  let complete = true, ms = 0;
  for (;;) {
    const t0 = performance.now();
    const answer = (await p.solver.check()) as Answer;
    ms += performance.now() - t0;
    if (answer !== "sat") { complete = answer === "unsat"; break; }
    const m = p.solver.model();
    const vals = outs.map((o) => Number(m.eval(o, true).toString())), rest = vals.slice(p.outs.length);
    let ex: Example[] | null = null;
    found.push({ t: vals.slice(0, p.outs.length), at: JSON.stringify(p.cases.map((_, c) => rest.slice(c * n, (c + 1) * n))),
                 ex: () => (ex ??= p.cases.map((s) => p.enc.readCase(m as never, s))) });
    p.solver.add(Not(And(...outs.map((o, i) => o.eq(vals[i])))));
  }
  p.solver.pop();
  return { found, complete, ms: Math.round(ms) };
}

// Only the mildest outcome the case can come out with, for each way the group's split-on facts can be fixed.
// Enough for questions where the other groups only need to stay out of the way: they do that best by coming
// out as mildly as they can. Mildest outcomes first, so most groups need one question per way of fixing.
async function mildest(p: Part, g: Group): Promise<Reachable> {
  const { And, Not, If, Int } = p.enc.ctx;
  const [s] = p.cases, o = p.outs[0];
  const fixed = g.split.map((atom) => {
    const key = atom.slice(atom.indexOf(":") + 1);
    if (atom.startsWith("items:")) return If(s.items[key][0].present, Int.val(1), Int.val(0)) as I;
    return atom.startsWith("fact:") ? s.facts[key] : s.computed[key];
  });
  p.solver.push();
  for (const c of told(p, g)) p.solver.add(c);
  const found: Reach[] = [];
  let complete = true, ms = 0;
  for (let level = p.sub.order.length - 1; level >= 0; ) {
    const t0 = performance.now();
    const answer = (await p.solver.check(o.eq(level))) as Answer;
    ms += performance.now() - t0;
    if (answer === "unknown") { complete = false; break; }
    if (answer === "unsat") { level--; continue; }
    const m = p.solver.model();
    const vals = fixed.map((x) => Number(m.eval(x, true).toString()));
    let ex: Example[] | null = null;
    found.push({ t: [level], at: JSON.stringify([vals]), ex: () => (ex ??= [p.enc.readCase(m as never, s)]) });
    if (!fixed.length) break;
    p.solver.add(Not(And(...fixed.map((x, i) => x.eq(vals[i])))));
  }
  p.solver.pop();
  return { found, complete, ms: Math.round(ms) };
}

// Answers kept by the content of the group they were asked about, so an unchanged group isn't asked again.
// Their examples are read from Z3's models, so forget them after shutdown() too.
const kept = new Map<string, unknown>();
export function forgetAnswers() { kept.clear(); checked.clear(); }
async function keep<T>(key: string, ask: () => Promise<T>): Promise<T> {
  if (!kept.has(key)) kept.set(key, await ask());
  return kept.get(key) as T;
}

// What identifies a group's question: the parts of the spec(s) it reads, how each fact's values are numbered,
// and which facts are split on and the values the group tells apart.
function groupKey(subs: Spec[], g: Group, dom: Record<string, Domain>, slots: number) {
  const facts = [...new Set(subs.flatMap((s) => [...s.facts.map((f) => f.key), ...s.computed.map((c) => c.key)]))].sort();
  return JSON.stringify([subs.map((s) => [s.order, s.unknowns.then, s.rules, s.facts, s.collections, s.computed, s.lists]),
                         facts.map((k) => dom[k] ?? null), slots, g.split, g.reps]);
}

// --- Fixing the split-on facts ---

// A value for each split-on fact (core/slice.ts): 1 or 0 for whether a list has items, or a fact's value number.
type Pick = Record<string, number>;

const product = <T>(choices: T[][]): T[][] => choices.reduce<T[][]>((acc, xs) => acc.flatMap((p) => xs.map((x) => [...p, x])), [[]]);
const range = (n: number) => [...Array(n).keys()];

// Every way to fix the split-on facts in each copy of the case. `ok` says which pair of values two copies may
// have for one fact (e.g. "the second copy knows what the first one does").
function picks(split: string[], dom: Record<string, Domain>, copies: number, ok: (atom: string, v: number[]) => boolean = () => true): Pick[][] {
  const perAtom = split.map((a) => product(range(copies).map(() => range(splitSize(a, dom)))).filter((v) => ok(a, v)));
  return product(perAtom).map((vs) => range(copies).map((c) => Object.fromEntries(split.map((a, i) => [a, vs[i][c]]))));
}

function pin(p: Part, ps: Pick[], g: Group): B[] {
  const { Not } = p.enc.ctx;
  return p.cases.flatMap((s, c) => g.split.flatMap((atom) => {
    const v = seenAs(g, atom, ps[c][atom]), key = atom.slice(atom.indexOf(":") + 1);
    if (atom.startsWith("items:")) { const first = s.items[key]?.[0]; return first ? [v ? first.present : Not(first.present)] : []; }
    const x = atom.startsWith("fact:") ? s.facts[key] : s.computed[key];
    return x ? [x.eq(v)] : [];
  }));
}
const pickKey = (ps: Pick[], g: Group) => JSON.stringify(ps.map((p) => g.split.map((a) => seenAs(g, a, p[a]))));

// Keeps a group's split-on facts to the values it tells apart, so Z3 is asked about each of those once.
const told = (p: Part, g: Group): B[] => p.cases.flatMap((s) => g.split.flatMap((atom) => {
  const r = g.reps[atom], key = atom.slice(atom.indexOf(":") + 1);
  if (!r) return [];
  const x = atom.startsWith("fact:") ? s.facts[key] : s.computed[key];
  return [p.enc.ctx.Or(...r.values.map((v) => x.eq(v)))];
}));

// What a group can reach with its split-on facts fixed one way.
const under = (r: Reachable, ps: Pick[], g: Group): Reachable => ({ ...r, found: r.found.filter((x) => x.at === pickKey(ps, g)) });

// --- Putting the groups back together ---

// The case's outcome is the most severe of each group's outcome. A state is one combination of outcomes the
// groups so far can reach together, with the per-group examples that reach it.
type State = { t: number[]; parts: () => { g: number; r: Reach }[] };

function join(xs: State[], ys: State[]): State[] {
  const m = new Map<string, State>();
  for (const x of xs) for (const y of ys) {
    const t = x.t.map((v, i) => Math.min(v, y.t[i]));
    const k = t.join();
    if (!m.has(k)) m.set(k, { t, parts: () => [...x.parts(), ...y.parts()] });
  }
  return [...m.values()];
}
const states = (r: Reachable, g: number): State[] => r.found.map((x) => ({ t: x.t, parts: () => [{ g, r: x }] }));

// For each group, what all the other groups can reach together. One pass each way, so this is linear in the
// number of groups, not quadratic.
function othersOf(each: State[][], start: State[]) {
  const before = [start], after = [start];
  for (let i = 0; i < each.length; i++) before.push(join(before[i], each[i]));
  for (let i = each.length - 1; i >= 0; i--) after.unshift(join(each[i], after[0]));
  return (i: number) => join(before[i], after[i + 1]);
}

// One case made of the groups' examples. Groups share no facts; for a list, a group with fewer items repeats its
// last one, which changes none of its "some item" conditions.
function merge(exs: Example[]): Example {
  const out: Example = { facts: {}, items: {}, computed: {} };
  for (const e of exs) { Object.assign(out.facts, e.facts); Object.assign(out.computed, e.computed); }
  for (const list of new Set(exs.flatMap((e) => Object.keys(e.items)))) {
    // A list no group gives stays not given. Only a group that adds the list up can tell, and it is the only
    // group reading that list (see slice.ts).
    const parts = exs.map((e) => e.items[list]).filter((x) => x !== null && x !== undefined);
    if (!parts.length) { out.items[list] = null; continue; }
    const n = Math.max(...parts.map((x) => x.length));
    out.items[list] = range(n).map((i) => Object.assign({}, ...parts.map((x) => x[Math.min(i, x.length - 1)])));
  }
  return out;
}

// Sets each split-on fact of an example to the value it was fixed to. A group's own example may show a different
// value that it can't tell apart from that one (see slice.ts), and another group may not.
function fixSplit(ex: Example, ps: Pick, dom: Record<string, Domain>): Example {
  const out = { ...ex, facts: { ...ex.facts }, computed: { ...ex.computed } };
  for (const [atom, v] of Object.entries(ps)) {
    const key = atom.slice(atom.indexOf(":") + 1);
    if (atom.startsWith("fact:")) out.facts[key] = dom[key].labels[v];
    else if (atom.startsWith("computed:")) out.computed[key] = dom[key].labels[v];
  }
  return out;
}

// --- Setting up a check ---

// Each group with the part of the spec it reads, and what identifies its questions for one and two copies of a case.
async function setup(specs: Spec[], opts: Options) {
  const ctx = await z3Context(), dom = domains(specs[0], specs.slice(1));
  const sliced = slice(specs, dom, opts.groups);
  const bounded: Bounded = {};
  const groups = sliced.groups.map((g) => {
    const sub = subSpec(specs[0], g);
    const [slots1, slots2, slotsDiffer] = (["one", "completes", "differ"] as const).map((k) => slotsFor([sub], k, opts, bounded));
    return { ...g, sub, slots1, slots2, slotsDiffer, key1: groupKey([sub], g, dom, slots1), key2: groupKey([sub], g, dom, slots2), key3: groupKey([sub], g, dom, slotsDiffer) };
  });
  return { ctx, dom, groups, split: sliced.split, bounded };
}
type G = Awaited<ReturnType<typeof setup>>["groups"][number];

// Builds a group's question the first time it is needed: a run whose answers are all kept builds none.
// Its solvers are freed when the check is done: waiting for garbage collection to free them runs Z3 out of memory.
function lazy(make: (g: G) => Part) {
  const made = new Map<G, Part>();
  return Object.assign((g: G) => made.get(g) ?? made.set(g, make(g)).get(g)!,
                       { release: () => { for (const p of made.values()) p.solver.release(); } });
}

// A group's question about one case.
const one = (ctx: Encoder["ctx"], dom: Record<string, Domain>) => lazy((g) => {
  const enc = new Encoder(ctx, g.sub, g.slots1, dom), s = enc.symCase("c");
  return part(enc, [s], [enc.run(s)]);
});

// What each group can reach on its own, for every way of fixing the split-on facts. Kept, so the dead-rule and
// unused-fact checks, and the next run after a small change, ask Z3 again only about changed groups.
const alone = (get: (g: G) => Part) => async (g: G, ps: Pick[]) =>
  under(await keep(`alone ${g.key1}`, () => reachable(get(g), g, [])), ps, g);
const mild = (get: (g: G) => Part) => async (g: G, ps: Pick[]) =>
  under(await keep(`mildest ${g.key1}`, () => mildest(get(g), g)), ps, g);

const lastOf = (specs: Spec[]): State[] => [{ t: specs.map((s) => s.order.length - 1), parts: () => [] }];

// --- The checks ---

// For every way of fixing the split-on facts: what each group can reach, and what all but one can reach together.
async function aroundAll(groups: G[], all: Pick[][], reach: (g: G, ps: Pick[]) => Promise<Reachable>, start: State[]) {
  const out = [];
  for (const ps of all) {
    const each: Reachable[] = [];
    for (const g of groups) each.push(await reach(g, ps));
    out.push({ ps, each, others: othersOf(each.map((r, i) => states(r, i)), start) });
  }
  return out;
}
type Around = Awaited<ReturnType<typeof aroundAll>>[number];

// What the other groups can reach together, as text, so a kept answer is reused only while they're unchanged.
const summary = (around: Around[], g: Group, gi: number) => JSON.stringify(around.map((a) => [pickKey(a.ps, g), a.others(gi).map((o) => o.t)]));

// One question about one group, with the other groups summarised: is there a way of fixing the split-on facts,
// and a combination of outcomes the other groups reach together that way, for which the whole case meets
// `target`? So each rule costs one question about its own group, however many groups the SOP has.
async function withOthers(p: Part, g: Group, gi: number, around: Around[], extra: B[], target: (t: I[]) => B) {
  const { And, Or, If, Int } = p.enc.ctx;
  // Many ways of fixing the split-on facts look the same to this group: ask about each one once.
  const distinct = new Map<string, { a: Around; o: State }>();
  for (const a of around) for (const o of a.others(gi)) {
    const k = `${pickKey(a.ps, g)} ${o.t}`;
    if (!distinct.has(k)) distinct.set(k, { a, o });
  }
  const options = [...distinct.values()].map(({ a, o }) => ({ a, o,
    when: And(...pin(p, a.ps, g), target(p.outs.map((x, i) => If(x.lt(o.t[i]), x, Int.val(o.t[i])) as I))) }));
  const proved = around.every((a) => a.each.every((x, i) => i === gi || x.complete));
  if (!options.length) return { answer: "unsat" as Answer, ms: 0, proved, hit: null };
  const { answer, ms, model } = await check(p, [...extra, Or(...options.map((x) => x.when))]);
  if (!model) return { answer, ms, proved, hit: null };
  const m = model as unknown as { eval(x: unknown, complete?: boolean): { toString(): string } };
  const chosen = options.find((x) => m.eval(x.when, true).toString() === "true")!;
  const mine: Reach = { t: p.outs.map((o) => Number(m.eval(o, true).toString())), at: pickKey(chosen.a.ps, g),
                        ex: () => p.cases.map((c) => p.enc.readCase(model, c)) };
  return { answer, ms, proved, hit: { ps: chosen.a.ps, parts: () => [...chosen.o.parts(), { g: gi, r: mine }] } };
}

// Findings in the order of the spec's rules, whatever group they came from.
const inOrder = (spec: Spec, fs: Finding[]) => fs.sort((a, b) => spec.rules.findIndex((r) => r.id === a.rule_ids[0]) - spec.rules.findIndex((r) => r.id === b.rule_ids[0]));

// A rule that can never decide a case: whenever it applies, a more severe rule applies too.
export async function deadRules(spec: Spec, opts: Options = {}): Promise<Finding[]> {
  const { ctx, dom, groups, split, bounded } = await setup([spec], opts);
  const get = one(ctx, dom);
  try {
    const around = await aroundAll(groups, picks(split, dom, 1), mild(get), lastOf([spec]));
    const applies = (g: G, id: string) => get(g).runs[0].rules[g.sub.rules.findIndex((r) => r.id === id)].applies;
    const out: Finding[] = [];
    for (const [gi, g] of groups.entries()) for (const r of g.sub.rules) {
      const then = spec.order.indexOf(r.then);
      // Does some case where this rule applies come out with its outcome, the other groups doing whatever they can?
      const decides = await keep(`dead ${g.key1} ${r.id} ${summary(around, g, gi)}`,
        async () => { const { answer, ms, proved } = await withOthers(get(g), g, gi, around, [applies(g, r.id)], (t) => t[0].eq(then)); return { answer, ms, proved }; });
      if (decides.answer !== "unsat" || !decides.proved) continue;  // "unknown" (the solver gave up) is not a proof
      const ms = decides.ms;
      // A rule whose conditions can't all hold at once never applies at all; no other rule is to blame.
      const can = await check(get(g), [applies(g, r.id)]);
      if (can.answer === "unsat") {
        out.push({
          id: `dead-${r.id}`, kind: "contradiction", rule_ids: [r.id], sop_refs: [r.sop],
          title: `${r.sop} can never apply`,
          example: null, example_facts: [],
          explain: `No case meets all of ${r.sop}'s conditions at once, so it never applies.`,
          proof: { asks: `Is there any case${upTo(spec, bounded, ["one"])} where ${r.sop} applies?`, code: `solver.add(applies("${r.id}"))`, answer: "unsat", ms },
        });
        continue;
      }
      // Which more severe rules always win? Report the ones that apply in every case where this one does.
      const winners: string[] = [];
      // Whether this rule can apply with the split-on facts fixed one way, asked only when needed.
      const seen = new Map<Around, boolean>();
      const canApply = async (a: Around) => seen.get(a) ?? seen.set(a, (await check(get(g), [applies(g, r.id), ...pin(get(g), a.ps, g)])).answer !== "unsat").get(a)!;
      // In its own group: find a case where this rule applies and some candidate doesn't, drop every candidate
      // that doesn't apply there, and repeat until no such case exists. The rest always apply with it.
      let inGroup = g.sub.rules.filter((w) => spec.order.indexOf(w.then) < then);
      while (inGroup.length) {
        const m = (await check(get(g), [applies(g, r.id), ctx.Or(...inGroup.map((w) => ctx.Not(applies(g, w.id))))])).model;
        if (!m) break;
        inGroup = inGroup.filter((w) => m.eval(applies(g, w.id) as never).toString() === "true");
      }
      for (const [hi, h] of groups.entries()) for (const w of h.sub.rules) {
        if (spec.order.indexOf(w.then) >= then) continue;
        let always = true;
        if (h === g) always = inGroup.includes(w);
        // A rule in another group wins wherever this one applies only if it applies whenever the split-on
        // facts let this one apply. If its group can come out milder than its outcome, it doesn't.
        else for (const a of around) {
          const milder = a.each[hi].found.some((x) => x.t[0] > spec.order.indexOf(w.then));
          if (!milder && (await check(get(h), [ctx.Not(applies(h, w.id)), ...pin(get(h), a.ps, h)])).answer === "unsat") continue;
          if (await canApply(a)) { always = false; break; }
        }
        if (always) winners.push(w.id);
      }
      const winnerRules = spec.rules.filter((x) => winners.includes(x.id));
      out.push({
        id: `dead-${r.id}`, kind: "contradiction", rule_ids: [r.id, ...winners], sop_refs: [r.sop, ...winnerRules.map((x) => x.sop), spec.order_sop],
        title: `${r.sop} can never decide a case`,
        example: null, example_facts: [],
        explain: `Whenever ${r.sop} applies, ${winnerRules.map((x) => x.sop).join(" and ") || "a more severe rule"} applies too, and ${spec.order_sop} says the most severe outcome governs. So no case is ever decided by ${r.sop}.`,
        proof: { asks: `Is there any case${upTo(spec, bounded, ["one"])} where ${r.sop} applies and decides the outcome?`, code: `solver.add(applies("${r.id}"), outcome.eq("${r.then}"))`, answer: "unsat", ms },
      });
    }
    return inOrder(spec, out);
  } finally {
    get.release();
  }
}

// A rule that applies only because a fact is unknown, and leads somewhere other than the spec's unknowns
// outcome (KYB 2.2). Example: KYB 3.4 asks for documents when an ID check simply hasn't come back.
export async function unknownTriggers(spec: Spec, opts: Options = {}): Promise<Finding[]> {
  const { ctx, dom, groups, split, bounded } = await setup([spec], opts);
  // Two copies of a case: one with unknowns, and one where every unknown has turned out some way.
  const get = lazy((g) => {
    const enc = new Encoder(ctx, g.sub, g.slots2, dom), a = enc.symCase("u"), b = enc.symCase("k");
    return part(enc, [a, b], [enc.run(a), enc.run(b)], enc.completes(a, b));
  });
  try {
    // A split-on fact that is known stays the same once the rest is known; an unknown one turns out some way.
    const unk = (atom: string) => splitSize(atom, dom) - 1;
    const all = picks(split, dom, 2, (atom, [u, k]) => atom.startsWith("items:") ? u === k : k !== unk(atom) && (u === k || u === unk(atom)));
    const around = await aroundAll(groups, all, async (g, ps) => under(await keep(`completes ${g.key2}`, () => reachable(get(g), g, [])), ps, g), lastOf([spec, spec]));
    const out: Finding[] = [];
    const item = (list: string) => spec.collections.find((c) => c.key === list)?.item ?? list;
    const label = (f: Finding["example_facts"][number]) => `${f.name}${f.item ? ` for ${item(f.list!)} ${f.item}` : ""}`;
    for (const [gi, g] of groups.entries()) for (const [ri, r] of g.sub.rules.entries()) {
      if (r.then === spec.unknowns.then) continue;
      // The rule decides the case while a fact is unknown, and once the facts are known it doesn't apply
      // and the case comes out differently.
      const then = spec.order.indexOf(r.then);
      const extra = () => [get(g).runs[0].rules[ri].applies, ctx.Not(get(g).runs[1].rules[ri].applies)];
      // Only the answer is kept: an example is rebuilt from this run's groups, by asking again only if the answer
      // came from the cache.
      const ask = () => withOthers(get(g), g, gi, around, extra(), (t) => ctx.And(t[0].eq(then), t[1].neq(then)));
      let asked: Awaited<ReturnType<typeof ask>> | undefined;
      const { answer, ms } = await keep(`unknown ${g.key2} ${r.id} ${summary(around, g, gi)}`, async () => { asked = await ask(); return { answer: asked.answer, ms: asked.ms }; });
      if (answer !== "sat") continue;
      const { hit } = asked ?? await ask();
      if (!hit) continue;
      // A short example: one item per list where that's enough, and in this rule's group every fact known that can
      // be, so a person sees only the facts that matter. (Asking for the fewest unknowns outright is slow on a big
      // group: proving no shorter example exists is the hard part.) Other groups only need to stay out of the way.
      // Each group's part again, this rule's group first: any outcome that keeps the finding true with the other
      // groups as they now are, and as few items as that allows.
      const parts = hit.parts().sort((x, y) => Number(y.g === gi) - Number(x.g === gi)), mildest = spec.order.length - 1;
      const ts = new Map(parts.map((x) => [x.g, x.r.t]));
      const exs: Example[][] = [];
      for (const { g: hi, r: x } of parts) {
        if (hi !== gi && Object.values(x.ex()[0].items).every((xs) => (xs ?? []).length <= 1)) { exs.push(x.ex()); continue; }
        const q = get(groups[hi]), [a] = q.cases;
        const cap = [0, 1].map((c) => Math.min(mildest, ...[...ts].filter(([h]) => h !== hi).map(([, t]) => t[c])));
        const capped = (o: I, c: number) => ctx.If(o.lt(cap[c]), o, ctx.Int.val(cap[c])) as I;
        const fixed = [...pin(q, hit.ps, groups[hi]), ...(hi === gi ? extra() : []), capped(q.outs[0], 0).eq(then), capped(q.outs[1], 1).neq(then)];
        let model = (await check(q, fixed)).model!;
        const keepIf = async (c: B) => { const m = (await check(q, [...fixed, c])).model; if (m) { fixed.push(c); model = m; } };
        await keepIf(ctx.And(...Object.values(a.items).flatMap((slots) => slots.slice(1).map((s) => ctx.Not(s.present)))));
        const done = () => { ts.set(hi, q.outs.map((o) => Number(model.eval(o as never, true as never).toString()))); exs.push(q.cases.map((s) => q.enc.readCase(model, s))); };
        if (hi !== gi) { done(); continue; }
        // As few unknown facts as possible: within one group the search stays small. Then every other fact that
        // can be known is, in case the count alone left some.
        const count = Number(model.eval(q.enc.unknownCount(a) as never, true as never).toString());
        for (let k = 1; k < count; k++) if ((await check(q, [...fixed, q.enc.unknownCount(a).le(k)])).model) { await keepIf(q.enc.unknownCount(a).le(k)); break; }
        const isTrue = (b: B) => model.eval(b as never).toString() === "true";
        for (const [k, v] of Object.entries(a.facts)) if (isTrue(v.eq(q.enc.unk(k)))) await keepIf(v.neq(q.enc.unk(k)));
        for (const slots of Object.values(a.items)) for (const slot of slots) for (const [k, v] of Object.entries(slot.facts)) {
          if (isTrue(ctx.And(slot.present, v.eq(q.enc.unk(k))))) await keepIf(v.neq(q.enc.unk(k)));
        }
        for (const slots of Object.values(a.items)) for (const slot of slots) for (const v of Object.values(slot.numeric)) {
          if (isTrue(ctx.And(slot.present, ctx.Not(v.known)))) await keepIf(v.known);
        }
        for (const [k, v] of Object.entries(a.computed)) if (isTrue(v.eq(q.enc.unk(k)))) await keepIf(v.neq(q.enc.unk(k)));
        for (const v of Object.values(a.numeric)) if (!isTrue(v.known)) await keepIf(v.known);
        done();
      }
      const ex = fixSplit(merge(exs.map((x) => x[0])), hit.ps[0], dom), known = fixSplit(merge(exs.map((x) => x[1])), hit.ps[1], dom);
      replay(spec, ex, (o) => o === r.then, `${r.sop} with a fact unknown`);
      replay(spec, known, (o) => o !== r.then, `${r.sop} once the facts are known`);
      const above = spec.order.indexOf(r.then) < spec.order.indexOf(spec.unknowns.then);
      const facts = exampleFacts(ex, factsOf(spec, [r.id])).filter((f) => f.value === "unknown");
      const later = exampleFacts(known, new Set(facts.map((f) => f.key))).filter((k) => facts.some((f) => f.key === k.key && f.list === k.list && f.item === k.item));
      out.push({
        id: `unknown-${r.id}`, kind: "unknowns", rule_ids: [r.id], sop_refs: [r.sop, spec.unknowns.sop],
        title: `${r.sop} treats an unknown fact differently from ${spec.unknowns.sop}`,
        example: `${facts.map((f) => `${label(f)} is unknown`).join(", ")}. If ${later.map((f) => `${label(f)} turned out "${f.value}"`).join(" and ")}, ${r.sop} would not apply.`,
        example_facts: facts,
        explain: `In this case ${r.sop} leads to ${name(r.then)} only because a fact is unknown. ${spec.unknowns.sop} says a case with an unknown fact is ${name(spec.unknowns.then)}, ` +
          (above ? `and ${spec.order_sop} ranks ${name(r.then)} above ${name(spec.unknowns.then)}, so ${r.sop} wins.` : `yet the case comes out ${name(r.then)}.`),
        proof: { asks: `Is there a case${upTo(spec, bounded, ["completes"])} that ${r.sop} decides, but that it would not apply to, and that would come out differently, once its unknown facts are known?`,
                 code: `solver.add(completes(c, known), applies("${r.id}", c), outcome(c).eq("${r.then}"), Not(applies("${r.id}", known)), outcome(known).neq("${r.then}"))`, answer: "sat", ms },
      });
    }
    return inOrder(spec, out);
  } finally {
    get.release();
  }
}

// Constraints saying two copies of a case are the same, except for one fact (for a list's fact, only in the
// first item).
function sameExcept(enc: Encoder, a: SymCase, b: SymCase, fact: string): B[] {
  const { And } = enc.ctx;
  const sameNum = (x: Num, y: Num) => And(x.known.eq(y.known), x.value.eq(y.value));
  return [
    ...Object.keys(a.facts).filter((k) => k !== fact).map((k) => a.facts[k].eq(b.facts[k])),
    ...Object.entries(a.items).flatMap(([list, slots]) => slots.flatMap((p, i) => [p.present.eq(b.items[list][i].present),
      ...Object.keys(p.facts).filter((k) => !(i === 0 && k === fact)).map((k) => p.facts[k].eq(b.items[list][i].facts[k])),
      ...Object.keys(p.numeric).filter((k) => !(i === 0 && k === fact)).map((k) => sameNum(p.numeric[k], b.items[list][i].numeric[k]))])),
    ...Object.keys(a.listed).map((k) => a.listed[k].eq(b.listed[k])),
    ...Object.keys(a.computed).map((k) => a.computed[k].eq(b.computed[k])),
    ...Object.keys(a.numeric).filter((k) => k !== fact).map((k) => sameNum(a.numeric[k], b.numeric[k])),
  ];
}

// A group that comes out the same in both copies of a case.
const twice = (r: Reachable): Reachable => ({ ...r, found: r.found.map((x) => ({ ...x, t: [x.t[0], x.t[0]], ex: () => [x.ex()[0], x.ex()[0]] })) });

// A split-on fact read by up to this many groups is checked with one question about those groups together. One
// question is fastest while it stays small; past this, it holds most of the SOP and comparing groups one at a
// time is faster.
const MERGE_READERS = 3;

// A fact the spec collects but that can never change an outcome.
export async function unusedFacts(spec: Spec, opts: Options = {}): Promise<Finding[]> {
  const { ctx, dom, groups, split, bounded } = await setup([spec], opts);
  const get = one(ctx, dom), profile = mild(get);
  try {
    const out: Finding[] = [];
    for (const f of spec.facts) {
      const atom = `fact:${f.key}`;
      const users = spec.rules.filter((r) => factsOf(spec, [r.id]).has(f.key));
      // Two copies of the case that differ only in this fact. The groups that read it (one, unless it is split on)
      // are compared as one group; every other group is the same in both copies, and gets out of the way best by
      // coming out as mildly as it can. A split-on fact is fixed differently in the two copies.
      const readers = groups.filter((g) => g.reads.has(atom));
      let changes = false, proved = true, ms = 0;
      if (readers.length && readers.length <= MERGE_READERS) {
        // The fact belongs to one group, or a few groups that share it because it is split on: one question about
        // those groups together, the other groups at their mildest.
        const u: Group = readers.length === 1 ? readers[0] : { entries: readers.flatMap((g) => g.entries), reads: new Set(readers.flatMap((g) => [...g.reads])),
                           split: [...new Set(readers.flatMap((g) => g.split))].sort(), reps: {} };
        if (readers.length > 1) u.reps = repsOf([spec], u, dom);
        const around: Around[] = [];
        for (const ps of picks(split, dom, 2, (a, [x, y]) => (a === atom ? x !== y : x === y))) {
          let level = spec.order.length - 1, possible = true;
          for (const h of groups) {
            if (h.reads.has(atom)) continue;
            const r = await profile(h, [ps[0]]);
            proved &&= r.complete;
            if (!r.found.length) { possible = false; break; }
            level = Math.min(level, r.found[0].t[0]);
          }
          if (possible) around.push({ ps, each: [], others: () => [{ t: [level, level], parts: () => [] }] });
        }
        const sub = subSpec(spec, u), slots = slotsFor([sub], "differ", opts, bounded);
        const q = await keep(`unused ${f.key} ${groupKey([sub], u, dom, slots)} ${JSON.stringify(around.map((a) => [pickKey(a.ps, u), a.others(0)[0].t[0]]))}`, async () => {
          const enc = new Encoder(ctx, sub, slots, dom), a = enc.symCase("f1"), b = enc.symCase("f2");
          const q = part(enc, [a, b], [enc.run(a), enc.run(b)], sameExcept(enc, a, b, f.key), 1);
          const { answer, ms } = await withOthers(q, u, 0, around, [], (t) => t[0].neq(t[1])).finally(() => q.solver.release());
          return { answer, ms };
        });
        ms = q.ms;
        changes = q.answer !== "unsat";
        proved &&= q.answer !== "unknown";
      } else if (readers.length) {
        // A split-on fact read by many groups: one question about all of them is too big. Each group that reads it
        // is compared on its own, and the groups are put back together.
        const timed = new Set<G>();  // each group's question is asked once, whatever the split-on facts are fixed to
        for (const ps of picks(split, dom, 2, (a, [x, y]) => (a === atom ? x !== y : x === y))) {
          const each: State[][] = [];
          for (const [gi, g] of groups.entries()) {
            const r = !g.reads.has(atom) ? twice(await profile(g, [ps[0]])) : under(await keep(`unused ${f.key} ${g.key3}`, () => {
              const enc = new Encoder(ctx, g.sub, g.slotsDiffer, dom), a = enc.symCase("f1"), b = enc.symCase("f2");
              const q = part(enc, [a, b], [enc.run(a), enc.run(b)], sameExcept(enc, a, b, f.key), 1);
              return reachable(q, g, []).finally(() => q.solver.release());
            }), ps, g);
            if (g.reads.has(atom) && !timed.has(g)) { timed.add(g); ms += r.ms; }
            proved &&= r.complete;
            each.push(states(r, gi));
          }
          if (each.reduce(join, lastOf([spec, spec])).some((s) => s.t[0] !== s.t[1])) { changes = true; break; }
        }
      }
      if (changes || !proved) continue;
      out.push({
        id: `unused-${f.key}`, kind: "contradiction", rule_ids: users.map((r) => r.id), sop_refs: users.map((r) => r.sop),
        title: `${cap(name(f.key))} never changes an outcome`,
        example: null, example_facts: [],
        explain: users.length
          ? `Only ${users.map((r) => r.sop).join(" and ")} use${users.length === 1 ? "s" : ""} ${name(f.key)}, and no case's outcome depends on it. Collecting it is wasted work unless a rule changes.`
          : `No rule uses ${name(f.key)}.`,
        proof: { asks: `Are there two cases${upTo(spec, bounded, ["one", "differ"])} that differ only in ${name(f.key)} and get different outcomes?`,
                 code: `solver.add(sameExcept("${f.key}", a, b), outcome(a).neq(outcome(b)))`, answer: "unsat", ms },
      });
    }
    return out;
  } finally {
    get.release();
  }
}

// What "no finding" means for each check on this spec: every case, or cases with up to so many items in each list
// (where a group needs more people than a check can look at quickly; see MAX_SLOTS). Asks Z3 nothing.
export function sopCoverage(spec: Spec, opts: Options = {}): { check: "dead" | "unknowns" | "unused"; upTo: number | null }[] {
  const dom = domains(spec), bounded: Bounded = {};
  for (const g of slice([spec], dom, opts.groups).groups) for (const k of ["one", "completes", "differ"] as const) slotsFor([subSpec(spec, g)], k, opts, bounded);
  const n = (ks: (keyof Bounded)[]) => { const m = Math.min(...ks.map((k) => bounded[k] ?? Infinity)); return m < Infinity ? m : null; };
  return [{ check: "dead", upTo: n(["one"]) }, { check: "unknowns", upTo: n(["completes"]) }, { check: "unused", upTo: n(["one", "differ"]) }];
}

// What "no change" from diffSpecs means: every case, or cases with up to so many items in each list. Asks Z3 nothing.
export function diffCoverage(a: Spec, b: Spec, opts: Options = {}): number | null {
  const dom = domains(a, [b]), bounded: Bounded = {};
  for (const g of slice([a, b], dom, opts.groups).groups) slotsFor([subSpec(a, g), subSpec(b, g, 1)], "one", opts, bounded);
  return bounded.one ?? null;
}

// The same spec gives the same findings, so a rerun (the pane after each edit to its answers) reuses them.
const checked = new Map<string, Promise<Finding[]>>();
export async function checkSop(spec: Spec, opts: Options = {}): Promise<Finding[]> {
  assertValid(spec);
  // A caller changing its spec while the check runs mustn't change what is kept under the old spec.
  [spec, opts] = structuredClone([spec, opts]);
  const key = JSON.stringify([spec, opts]);
  if (!checked.has(key)) {
    checked.set(key, (async () => [...(await deadRules(spec, opts)), ...(await unknownTriggers(spec, opts)), ...(await unusedFacts(spec, opts))])()
      .catch((e) => { checked.delete(key); throw e; }));
  }
  return structuredClone(await checked.get(key)!);
}

// One case of a group's question that meets `fixed`, as short as it can be: one item per list where that's
// enough, then every fact known that can be.
async function shortCase(q: Part, fixed: B[]): Promise<Example> {
  const { ctx } = q.enc, [a] = q.cases, done = [...fixed];
  let model = (await check(q, done)).model!;
  const keepIf = async (c: B) => { const m = (await check(q, [...done, c])).model; if (m) { done.push(c); model = m; } };
  await keepIf(ctx.And(...Object.values(a.items).flatMap((slots) => slots.slice(1).map((s) => ctx.Not(s.present)))));
  const isTrue = (b: B) => model.eval(b as never).toString() === "true";
  for (const [k, v] of Object.entries(a.facts)) if (isTrue(v.eq(q.enc.unk(k)))) await keepIf(v.neq(q.enc.unk(k)));
  for (const slots of Object.values(a.items)) for (const slot of slots) {
    for (const [k, v] of Object.entries(slot.facts)) if (isTrue(ctx.And(slot.present, v.eq(q.enc.unk(k))))) await keepIf(v.neq(q.enc.unk(k)));
    for (const v of Object.values(slot.numeric)) if (isTrue(ctx.And(slot.present, ctx.Not(v.known)))) await keepIf(v.known);
  }
  for (const [k, v] of Object.entries(a.computed)) if (isTrue(v.eq(q.enc.unk(k)))) await keepIf(v.neq(q.enc.unk(k)));
  for (const v of Object.values(a.numeric)) if (!isTrue(v.known)) await keepIf(v.known);
  return q.enc.readCase(model, a);
}

// The cases whose outcome changes between two spec versions, one example for each change of outcome.
export async function diffSpecs(a: Spec, b: Spec, opts: Options = {}) {
  assertValid(a);
  assertValid(b);
  // Both versions read one symbolic case, so they must have the same facts, in the same places, and the same
  // computed facts from the pack. Their values may differ: a list that gains a country is the kind of change to
  // compare. A sum the spec works out itself isn't part of the case, so each version may define its own.
  const shape = (x: Spec) => JSON.stringify([x.facts.map((f) => [f.key, f.per, !!f.numeric]).sort(), x.computed.filter((c) => !c.sum).map((c) => [c.key, !!c.numeric]).sort(),
                                            x.collections.map((c) => c.key).sort()]);
  if (shape(a) !== shape(b)) throw new Error("The two versions use different facts; compare them fact by fact first.");
  // Z3's case already holds the spec's values, not the case's words, so it can't see a word map change.
  if (JSON.stringify(a.maps ?? {}) !== JSON.stringify(b.maps ?? {})) throw new Error("The two versions read the case's words differently (their word maps differ); Z3 can't compare that.");
  const { ctx, dom, groups, split, bounded } = await setup([a, b], opts);
  const get = one(ctx, dom), profile = alone(get);
  // A group whose rules didn't change comes out the same in both versions, so only one version is asked about.
  // A rule's meaning also depends on its facts' values and on what the spec's own sums add up.
  const rulesOf = (s: Spec) => [s.order, s.unknowns.then, s.collections, s.facts, s.computed, s.rules.map((r) =>
    [r.id, r.then, JSON.stringify(r.when, (k, v) => (k === "in" && typeof v === "string" ? s.lists[v] : v))])];
  const same = (g: G) => JSON.stringify(rulesOf(g.sub)) === JSON.stringify(rulesOf(subSpec(b, g, 1)));
  const slotsOf = (g: G) => slotsFor([g.sub, subSpec(b, g, 1)], "one", opts, bounded);
  // The group's part of each version: both versions' rules made the group, so both read the same facts here.
  const both = lazy((g) => {
    const ea = new Encoder(ctx, g.sub, slotsOf(g), dom), eb = new Encoder(ctx, subSpec(b, g, 1), slotsOf(g), dom);
    const s = ea.symCase("diff");
    return part(ea, [s], [ea.run(s), eb.run(s)]);
  });
  try {
    const versions = (g: G, ps: Pick[]) => same(g) ? profile(g, ps).then(twice)
      : keep(`versions ${groupKey([g.sub, subSpec(b, g, 1)], g, dom, slotsOf(g))}`, () => reachable(both(g), g, [])).then((r) => under(r, ps, g));
    const reached = new Map<string, { s: State; ps: Pick }>();
    for (const ps of picks(split, dom, 1)) {
      const each: State[][] = [];
      for (const [gi, g] of groups.entries()) {
        const r = await versions(g, ps);
        // Z3 giving up is not a proof that the two agree.
        if (!r.complete) throw new Error(`Z3 couldn't decide how version ${a.version}'s outcomes change in version ${b.version}.`);
        each.push(states(r, gi));
      }
      for (const s of each.reduce(join, lastOf([a, b]))) if (!reached.has(s.t.join())) reached.set(s.t.join(), { s, ps: ps[0] });
    }
    const changes: { from: string; to: string; example: Example }[] = [];
    for (const from of a.order) for (const to of b.order) {
      if (from === to) continue;
      const hit = reached.get([a.order.indexOf(from), b.order.indexOf(to)].join());
      if (!hit) continue;
      // A short example: each group's part again with one item per list where that's enough, and its facts known
      // where they can be, coming out the same way.
      const exs: Example[] = [];
      for (const { g: gi, r: x } of hit.s.parts()) {
        const g = groups[gi], q = same(g) ? get(g) : both(g);
        exs.push(await shortCase(q, [...pin(q, [hit.ps], g), ...q.outs.map((o, i) => o.eq(x.t[i]))]));
      }
      const example = fixSplit(merge(exs), hit.ps, dom);
      replay(a, example, (o) => o === from, `version ${a.version}'s ${from}`);
      replay(b, example, (o) => o === to, `version ${b.version}'s ${to}`);
      changes.push({ from, to, example });
    }
    return changes;
  } finally {
    get.release();
    both.release();
  }
}
