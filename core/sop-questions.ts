// How a check puts its questions to Z3 (core/sop-checks.ts has the checks themselves). The rules are split into
// groups that read none of the same facts (core/slice.ts); each group gets its own solver, its answers are kept by
// the group's content, and the groups' outcomes are joined back into the whole case's.
import { type Group, type Grouping, seenAs, slice, splitSize, subSpec, summed } from "./slice.ts";
import type { Spec } from "./spec.ts";
import { type B, type Domain, domains, Encoder, type I, oneAtATime, type SymCase, z3Context } from "./z3.ts";
import { GaveUp, QuantEncoder } from "./z3-quantified.ts";

// How to group the rules (core/slice.ts); only tests and the benchmark change it. `slots` looks at cases with up
// to that many items in each list instead of every case, and the proofs say so. `encoding` says how a group's lists
// become Z3 variables:
// - "slots": a fixed number of items per list, enough for every case (see slotsNeeded) unless that's more than
//   MAX_SLOTS, when the proofs say how many they looked at.
// - "quantified": no slots, any number of items (core/z3-quantified.ts). Lists that are added up still have slots.
// - "auto" (the default): slots where a group needs no more than MAX_SLOTS, since slots are fastest there; quantified
//   where slots would be capped, so those groups cover any number of items too, except in a list that is added up
//   (which keeps the slots it had). A group with a summed list but few enough items stays on slots and says "up to
//   N": quantifying it too would cover any number of people, at about twice the time on KYB. A quantified
//   question that takes longer than `budgetMs`, or that Z3 gives up on, sends its group back to capped slots.
export type Options = { groups?: Grouping; slots?: number; encoding?: "slots" | "quantified" | "auto"; budgetMs?: number };

// How long one quantified question may take before its group goes back to capped slots. KYB's longest takes about
// 2 s; a group that needs much longer is one where quantifiers don't pay (see the spike write-up's made-up SOPs).
const BUDGET_MS = 20_000;

// Questions whose group went back to capped slots because a quantified question ran out of time, Z3 gave up on it,
// or its answer didn't read back. They are checked with capped slots from then on, and the proofs and sopCoverage
// say so. Cleared with the kept answers.
const fellBack = new Set<string>();
// What a fallback is remembered by: the check kind, the budget, and the whole of the specs the question reads (a diff
// reads two versions). So a give-up in one check doesn't cap another, a run with a tiny budget doesn't cap a later
// run, and an edited group is tried quantified again (found in the PR #24 review).
const fallbackKey = (specs: Spec[], kind: Kind, opts: Options) => JSON.stringify([kind, opts.budgetMs ?? BUDGET_MS, specs]);

// The encoder for a group's question. A negative slot count means quantified, with that many slots (made positive)
// for the lists that are added up. `versions` are the specs the question reads (a diff reads two), so that a list
// added up in either version has slots in both. Only "auto" falls back; an explicit "quantified" doesn't (Tenki).
export function encoder(ctx: Encoder["ctx"], spec: Spec, slots: number, dom: Record<string, Domain>, opts: Options, kind: Kind, versions = [spec]) {
  if (slots >= 0) return new Encoder(ctx, spec, slots, dom);
  const enc = new QuantEncoder(ctx, spec, -slots, dom, opts.budgetMs ?? BUDGET_MS, versions);
  if ((opts.encoding ?? "auto") === "auto") enc.fallbackKey = fallbackKey(versions, kind, opts);
  return enc;
}

// A quantified question Z3 didn't answer: under "auto", start the check again with that group on slots. (Otherwise
// "unknown" is handled where it comes up: it is never read as a proof.)
function gaveUp(p: Part, answer: Answer) {
  if (answer === "unknown" && p.enc instanceof QuantEncoder && p.enc.fallbackKey) throw new GaveUp(p.enc.fallbackKey);
}
// A value read from a part's model: with quantifiers, only a plain value is read (see QuantEncoder.literal).
export const valueOf = (p: Part, m: { eval(x: never, complete?: boolean): { toString(): string } }, x: unknown, what: string, complete = true) =>
  p.enc instanceof QuantEncoder ? p.enc.literal(m.eval(x as never, true).toString(), what) : m.eval(x as never, complete).toString();
// Runs a check until no quantified question gives up. Answers already kept make the reruns cheap.
export function withFallback<T>(run: () => Promise<T>): Promise<T> {
  return oneAtATime(async () => {
    for (;;) {
      try { return await run(); } catch (e) {
        if (!(e instanceof GaveUp) || fellBack.has(e.key)) throw e;
        fellBack.add(e.key);
      }
    }
  });
}

export type Example = ReturnType<Encoder["readCase"]>;
type Answer = "sat" | "unsat" | "unknown";

export const name = (k: string) => k.replace(/_/g, " ");
export const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

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

// For each list, the fewest items any question of a check looked at, where that was fewer than every case needs:
// when the caller set the number, when MAX_SLOTS capped it, or when the group adds a list up (no number covers every
// case there). A list that isn't here was looked at with any number of items.
export type Kind = "one" | "completes" | "differ";
export type Bounded = Partial<Record<Kind, Record<string, number>>>;
const bound = (bounded: Bounded, kind: Kind, lists: string[], n: number) => {
  const b = (bounded[kind] ??= {});
  for (const l of lists) b[l] = Math.min(b[l] ?? Infinity, n);
};
const summedLists = (s: Spec) => s.collections.map((c) => c.key).filter((k) => summed(s, k));
export function slotsFor(specs: Spec[], kind: Kind, opts: Options, bounded: Bounded) {
  const lists = [...new Set(specs.flatMap((s) => s.collections.map((c) => c.key)))];
  const sums = [...new Set(specs.flatMap(summedLists))];
  const encoding = opts.encoding ?? "auto", need = slotsNeeded(specs, kind);
  // Quantified, only lists that are added up have slots, as many as they would have with slots, and the proofs say so.
  if (!opts.slots && (encoding === "quantified" || (encoding === "auto" && need > MAX_SLOTS[kind] && !fellBack.has(fallbackKey(specs, kind, opts))))) {
    const n = Math.min(need, MAX_SLOTS[kind]);
    bound(bounded, kind, sums, n);
    return -n;
  }
  // Slots bound every list of the group alike.
  const n = opts.slots ?? Math.min(need, MAX_SLOTS[kind]);
  if (opts.slots || sums.length || n < need) bound(bounded, kind, lists, n);
  return n;
}

// For each of the spec's lists, the fewest items the given checks looked at (null: any number).
export const coverage = (spec: Spec, bounded: Bounded, kinds: Kind[]) => Object.fromEntries(spec.collections.map((c) => {
  const n = Math.min(...kinds.map((k) => bounded[k]?.[c.key] ?? Infinity));
  return [c.key, n < Infinity ? n : null];
}));

// What a proof covers: every case, cases with up to so many items in each list, or that for some lists only.
export const upTo = (spec: Spec, bounded: Bounded, kinds: Kind[]) => {
  if (!spec.collections.length) return "";
  const by = coverage(spec, bounded, kinds), ns = Object.values(by);
  if (ns.every((n) => n === null)) return " (with any number of items)";
  if (ns.every((n) => n === ns[0])) return ` with up to ${ns[0]} items in each list`;
  const any = Object.keys(by).filter((k) => by[k] === null).map(name);
  const some = Object.entries(by).filter(([, n]) => n !== null).map(([k, n]) => `up to ${n} ${name(k)}`);
  return ` (with ${[...(any.length ? [`any number of ${any.join(" and ")}`] : []), ...some].join(" and ")})`;
};

// --- Asking one group ---

// One group's question: symbolic copies of a case (two when a check compares cases), each copy's outcome
// under the group's rules, and one solver that keeps what it learns from question to question.
export type Part = { enc: Encoder; sub: Spec; cases: SymCase[]; outs: I[]; runs: ReturnType<Encoder["run"]>[]; solver: InstanceType<Encoder["ctx"]["Solver"]> };

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

export function part(enc: Encoder, cases: SymCase[], runs: ReturnType<Encoder["run"]>[], link: B[] = [], from = 0): Part {
  const solver = new enc.ctx.Solver();
  for (const c of [...cases.flatMap((s) => s.domain), ...link, ...sorted(enc, cases[0], from)]) solver.add(c);
  for (const s of cases) (s as { sealed?: boolean }).sealed = true;
  if (enc instanceof QuantEncoder) enc.configure(solver);
  return { enc, sub: enc.spec, cases, outs: runs.map((r) => r.outcome), runs, solver };
}

export async function check(p: Part, extra: B[]): Promise<{ answer: Answer; ms: number; model: Parameters<Encoder["readCase"]>[0] | null }> {
  p.solver.push();
  for (const c of extra) p.solver.add(c);
  const t = performance.now();
  const answer = (await p.solver.check()) as Answer;
  gaveUp(p, answer);
  const model = answer === "sat" ? (p.solver.model() as unknown as Parameters<Encoder["readCase"]>[0]) : null;
  p.solver.pop();
  return { answer, ms: Math.round(performance.now() - t), model };
}

// Every combination of outcomes the copies can come out with, for each way the group's split-on facts can be
// fixed (`at`, see pickKey), with one example case for each. `complete` is false if Z3 gave up, in which case a
// combination that isn't listed hasn't been ruled out.
type Reach = { t: number[]; at: string; ex: () => Example[] };
export type Reachable = { found: Reach[]; complete: boolean; ms: number };

export async function reachable(p: Part, g: Group, extra: B[]): Promise<Reachable> {
  const { And, Not, If, Int } = p.enc.ctx;
  // The split-on facts as numbers, copy by copy, in the order pickKey lists them.
  const fixed = p.cases.flatMap((s) => g.split.map((atom) => {
    const key = atom.slice(atom.indexOf(":") + 1);
    if (atom.startsWith("items:")) return If(p.enc.anyItem(s, key), Int.val(1), Int.val(0)) as I;
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
    gaveUp(p, answer);
    if (answer !== "sat") { complete = answer === "unsat"; break; }
    const m = p.solver.model();
    const vals = outs.map((o) => Number(valueOf(p, m as never, o, "an outcome"))), rest = vals.slice(p.outs.length);
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
export async function mildest(p: Part, g: Group): Promise<Reachable> {
  const { And, Not, If, Int } = p.enc.ctx;
  const [s] = p.cases, o = p.outs[0];
  const fixed = g.split.map((atom) => {
    const key = atom.slice(atom.indexOf(":") + 1);
    if (atom.startsWith("items:")) return If(p.enc.anyItem(s, key), Int.val(1), Int.val(0)) as I;
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
    gaveUp(p, answer);
    if (answer === "unknown") { complete = false; break; }
    if (answer === "unsat") { level--; continue; }
    const m = p.solver.model();
    const vals = fixed.map((x) => Number(valueOf(p, m as never, x, "a split-on fact")));
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
export function forgetQuestions() { kept.clear(); fellBack.clear(); }
export async function keep<T>(key: string, ask: () => Promise<T>): Promise<T> {
  if (!kept.has(key)) kept.set(key, await ask());
  return kept.get(key) as T;
}

// What identifies a group's question: the parts of the spec(s) it reads, how each fact's values are numbered,
// and which facts are split on and the values the group tells apart.
export function groupKey(subs: Spec[], g: Group, dom: Record<string, Domain>, slots: number) {
  const facts = [...new Set(subs.flatMap((s) => [...s.facts.map((f) => f.key), ...s.computed.map((c) => c.key)]))].sort();
  return JSON.stringify([subs.map((s) => [s.order, s.unknowns.then, s.rules, s.facts, s.collections, s.computed, s.lists]),
                         facts.map((k) => dom[k] ?? null), slots, g.split, g.reps]);
}

// --- Fixing the split-on facts ---

// A value for each split-on fact (core/slice.ts): 1 or 0 for whether a list has items, or a fact's value number.
export type Pick = Record<string, number>;

const product = <T>(choices: T[][]): T[][] => choices.reduce<T[][]>((acc, xs) => acc.flatMap((p) => xs.map((x) => [...p, x])), [[]]);
const range = (n: number) => [...Array(n).keys()];

// Every way to fix the split-on facts in each copy of the case. `ok` says which pair of values two copies may
// have for one fact (e.g. "the second copy knows what the first one does").
export function picks(split: string[], dom: Record<string, Domain>, copies: number, ok: (atom: string, v: number[]) => boolean = () => true): Pick[][] {
  const perAtom = split.map((a) => product(range(copies).map(() => range(splitSize(a, dom)))).filter((v) => ok(a, v)));
  return product(perAtom).map((vs) => range(copies).map((c) => Object.fromEntries(split.map((a, i) => [a, vs[i][c]]))));
}

export function pin(p: Part, ps: Pick[], g: Group): B[] {
  const { Not } = p.enc.ctx;
  return p.cases.flatMap((s, c) => g.split.flatMap((atom) => {
    const v = seenAs(g, atom, ps[c][atom]), key = atom.slice(atom.indexOf(":") + 1);
    if (atom.startsWith("items:")) { const any = p.enc.anyItem(s, key); return s.items[key] ? [v ? any : Not(any)] : []; }
    const x = atom.startsWith("fact:") ? s.facts[key] : s.computed[key];
    return x ? [x.eq(v)] : [];
  }));
}
export const pickKey = (ps: Pick[], g: Group) => JSON.stringify(ps.map((p) => g.split.map((a) => seenAs(g, a, p[a]))));

// Keeps a group's split-on facts to the values it tells apart, so Z3 is asked about each of those once.
const told = (p: Part, g: Group): B[] => p.cases.flatMap((s) => g.split.flatMap((atom) => {
  const r = g.reps[atom], key = atom.slice(atom.indexOf(":") + 1);
  if (!r) return [];
  const x = atom.startsWith("fact:") ? s.facts[key] : s.computed[key];
  return [p.enc.ctx.Or(...r.values.map((v) => x.eq(v)))];
}));

// What a group can reach with its split-on facts fixed one way.
export const under = (r: Reachable, ps: Pick[], g: Group): Reachable => ({ ...r, found: r.found.filter((x) => x.at === pickKey(ps, g)) });

// --- Putting the groups back together ---

// The case's outcome is the most severe of each group's outcome. A state is one combination of outcomes the
// groups so far can reach together, with the per-group examples that reach it.
export type State = { t: number[]; parts: () => { g: number; r: Reach }[] };

export function join(xs: State[], ys: State[]): State[] {
  const m = new Map<string, State>();
  for (const x of xs) for (const y of ys) {
    const t = x.t.map((v, i) => Math.min(v, y.t[i]));
    const k = t.join();
    if (!m.has(k)) m.set(k, { t, parts: () => [...x.parts(), ...y.parts()] });
  }
  return [...m.values()];
}
export const states = (r: Reachable, g: number): State[] => r.found.map((x) => ({ t: x.t, parts: () => [{ g, r: x }] }));

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
export function merge(exs: Example[]): Example {
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
export function fixSplit(ex: Example, ps: Pick, dom: Record<string, Domain>): Example {
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
export async function setup(specs: Spec[], opts: Options) {
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
export type G = Awaited<ReturnType<typeof setup>>["groups"][number];

// Builds a group's question the first time it is needed: a run whose answers are all kept builds none.
// Its solvers are freed when the check is done: waiting for garbage collection to free them runs Z3 out of memory.
export function lazy(make: (g: G) => Part) {
  const made = new Map<G, Part>();
  return Object.assign((g: G) => made.get(g) ?? made.set(g, make(g)).get(g)!,
                       { release: () => { for (const p of made.values()) p.solver.release(); } });
}

// Examples are shortened with slots: quantifiers can't count a case's unknown facts, so a quantified example comes
// out longer than it needs to. A quantified question's example has some number of items, so a slotted question
// with that many items has a case too. `make` builds that question for a group and a number of items.
export const items = (ex: Example[]) => Math.max(1, ...ex.flatMap((e) => Object.values(e.items).map((xs) => (xs ?? []).length)));
export function slottedFor(get: (g: G) => Part, make: (g: G, n: number) => Part) {
  // By the group itself: two groups can read the same lists with the same rules, e.g. two a diff adds (Gemini).
  const made = new Map<G, Map<number, Part>>();
  return Object.assign((g: G, ex: Example[]) => {
    if (!(get(g).enc instanceof QuantEncoder)) return get(g);
    const byN = made.get(g) ?? made.set(g, new Map()).get(g)!, n = items(ex);
    return byN.get(n) ?? byN.set(n, make(g, n)).get(n)!;
  }, { release: () => { for (const byN of made.values()) for (const p of byN.values()) p.solver.release(); } });
}

// A group's question about one case.
export const one = (ctx: Encoder["ctx"], dom: Record<string, Domain>, opts: Options) => lazy((g) => {
  const enc = encoder(ctx, g.sub, g.slots1, dom, opts, "one"), s = enc.symCase("c");
  return part(enc, [s], [enc.run(s)]);
});

// What each group can reach on its own, for every way of fixing the split-on facts. Kept, so the dead-rule and
// unused-fact checks, and the next run after a small change, ask Z3 again only about changed groups.
export const alone = (get: (g: G) => Part) => async (g: G, ps: Pick[]) =>
  under(await keep(`alone ${g.key1}`, () => reachable(get(g), g, [])), ps, g);
export const mild = (get: (g: G) => Part) => async (g: G, ps: Pick[]) =>
  under(await keep(`mildest ${g.key1}`, () => mildest(get(g), g)), ps, g);

export const lastOf = (specs: Spec[]): State[] => [{ t: specs.map((s) => s.order.length - 1), parts: () => [] }];

// --- The checks ---

// For every way of fixing the split-on facts: what each group can reach, and what all but one can reach together.
export async function aroundAll(groups: G[], all: Pick[][], reach: (g: G, ps: Pick[]) => Promise<Reachable>, start: State[]) {
  const out = [];
  for (const ps of all) {
    const each: Reachable[] = [];
    for (const g of groups) each.push(await reach(g, ps));
    out.push({ ps, each, others: othersOf(each.map((r, i) => states(r, i)), start) });
  }
  return out;
}
export type Around = Awaited<ReturnType<typeof aroundAll>>[number];

// What the other groups can reach together, as text, so a kept answer is reused only while they're unchanged.
export const summary = (around: Around[], g: Group, gi: number) => JSON.stringify(around.map((a) => [pickKey(a.ps, g), a.others(gi).map((o) => o.t)]));

// One question about one group, with the other groups summarised: is there a way of fixing the split-on facts,
// and a combination of outcomes the other groups reach together that way, for which the whole case meets
// `target`? So each rule costs one question about its own group, however many groups the SOP has.
export async function withOthers(p: Part, g: Group, gi: number, around: Around[], extra: B[], target: (t: I[]) => B) {
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
  const chosen = options.find((x) => valueOf(p, m as never, x.when, "which case was found") === "true")!;
  const mine: Reach = { t: p.outs.map((o) => Number(valueOf(p, m as never, o, "an outcome"))), at: pickKey(chosen.a.ps, g),
                        ex: () => p.cases.map((c) => p.enc.readCase(model, c)) };
  return { answer, ms, proved, hit: { ps: chosen.a.ps, parts: () => [...chosen.o.parts(), { g: gi, r: mine }] } };
}
