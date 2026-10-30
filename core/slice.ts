// Splits an SOP into groups of rules that read none of the same facts, so each check asks Z3 small questions
// instead of handing it the whole SOP every time. Nothing here decides anything about a case: it only works out
// which rules can affect each other.
//
// Why the groups can be checked apart and put back together:
// - The outcome is the most severe outcome any rule reaches, so it is the most severe of each group's outcome.
// - Groups share no case fact and no fact of a list's items, so any outcome one group can reach, it can reach
//   whatever the other groups do.
// - Items are the one thing groups share: each group needs its own number of people. A "some item" condition
//   doesn't change when an item is copied, so a case for one group and a case for another join into one case
//   by repeating the last item of whichever has fewer. Only "the list is empty" can't be repeated away, so
//   whether each list is empty is fixed first ("split on"), the same for every group.
// - A fact nearly every rule reads (KYB's "excluded") would put every rule in one group. If fixing its value
//   first breaks the SOP into smaller groups, it is split on too, and each value is checked in turn.
import type { Condition, Rule, Spec, Term } from "./spec.ts";
import type { Domain } from "./z3.ts";

// What a condition reads: "fact:k" for a case or item fact, "computed:k", and "items:list" for whether a list has
// items. A "some item" reads its list's empty rule and who counts in it, since those decide with it. A sum the
// spec works out reads every part of it. A list that is added up somewhere also reads as "list:k": adding up its
// items is not undone by repeating one (see below), so every rule that reads that list stays in one group.
export function reads(spec: Spec, c: Condition, out = new Set<string>()): Set<string> {
  if ("all" in c) c.all.forEach((x) => reads(spec, x, out));
  else if ("any" in c) c.any.forEach((x) => reads(spec, x, out));
  else if ("not" in c) reads(spec, c.not, out);
  else if ("some" in c) {
    list(spec, c.some, out);
    reads(spec, c.where, out);
  } else if ("sum" in c) terms(spec, c.sum, out);
  else if ("fact" in c) out.add(`fact:${c.fact}`);
  else terms(spec, [{ computed: c.computed }], out);
  return out;
}

// Whether the spec adds up a list's items anywhere (a sum_over in a rule, a list or a computed fact).
export const summed = (spec: Spec, key: string) => JSON.stringify([spec.rules, spec.collections, spec.computed]).includes(`"sum_over":${JSON.stringify(key)}`);

function list(spec: Spec, key: string, out: Set<string>) {
  if (out.has(`items:${key}`)) return;
  out.add(`items:${key}`);
  if (summed(spec, key)) out.add(`list:${key}`);
  const col = spec.collections.find((x) => x.key === key);
  if (col?.empty_ok_when) reads(spec, col.empty_ok_when, out);
  if (col?.counts_when) reads(spec, col.counts_when, out);
}

function terms(spec: Spec, ts: Term[], out: Set<string>) {
  for (const t of ts) {
    if ("sum_over" in t) {
      list(spec, t.sum_over, out);
      out.add(`fact:${t.of}`);
      if (t.where) reads(spec, t.where, out);
    } else if ("fact" in t) out.add(`fact:${t.fact}`);
    else if (!out.has(`computed:${t.computed}`)) {
      out.add(`computed:${t.computed}`);
      const def = spec.computed.find((x) => x.key === t.computed)?.sum;
      if (def) terms(spec, def, out);
    }
  }
}

// A rule of one of the specs being checked together (a diff checks two versions at once).
export type Entry = { rule: Rule; side: number; reads: Set<string> };

// A group: rules that, through shared facts, can affect each other. `split` is the split-on facts they read.
// `reps` lists, for each split-on fact, the values the group tells apart: the values its rules compare with,
// one value standing for all the others, and unknown. Fixing a fact to any other value is the same to it.
export type Reps = { values: number[]; other?: number };
export type Group = { entries: Entry[]; reads: Set<string>; split: string[]; reps: Record<string, Reps> };

function groups(entries: Entry[], split: Set<string>): Group[] {
  const parent = entries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  entries.forEach((e, i) => {
    for (const a of e.reads) {
      if (split.has(a)) continue;
      const j = owner.get(a);
      if (j === undefined) owner.set(a, i);
      else parent[find(i)] = find(j);
    }
  });
  const by = new Map<number, Entry[]>();
  entries.forEach((e, i) => { const r = find(i); by.set(r, [...(by.get(r) ?? []), e]); });
  return [...by.values()].map((es) => {
    const all = new Set(es.flatMap((e) => [...e.reads]));
    return { entries: es, reads: all, split: [...all].filter((a) => split.has(a)).sort(), reps: {} };
  });
}


// How many values a split-on fact has: a list is empty or not; a fact takes each of its values or unknown.
export function splitSize(atom: string, dom: Record<string, Domain>) {
  return atom.startsWith("items:") ? 2 : dom[atom.slice(atom.indexOf(":") + 1)].labels.length;
}

// Fixing a fact multiplies some questions by its number of values, so split on at most this many combinations.
const MAX_COMBINATIONS = 256;

// Roughly what asking about a set of groups costs, fitted to a few measured runs (bench/). Each way of fixing a
// group's split-on facts costs questions: the unknowns check compares a case with unknowns to the same case
// once they are known, so a fact counts once for each pair of values it can take in the two (a list: empty in
// both or in neither; a fact: the same known value in both, or unknown then a known one). And each rule costs a
// question about its whole group, which grows with the group's rules and with its people: one set of slots per
// "some person" condition, each slot holding every fact about a person the group reads. That question also says
// "for one of the ways of fixing the split-on facts", which grows it again (about with the square root of their
// number, measured on a tangled 52-rule SOP: splitting there made a 54 s run take 191 s).
const cost = (gs: Group[], specs: Spec[], dom: Record<string, Domain>) => gs.reduce((n, g) => {
  const reps = repsOf(specs, g, dom);
  const pairs = g.split.reduce((m, a) => m * (a.startsWith("items:") ? 2 : 2 * (reps[a].values.length - 1)), 1);
  const somes = JSON.stringify(g.entries.map((e) => e.rule.when)).split('"some":').length - 1;
  const perItem = [...g.reads].filter((a) => a.startsWith("fact:") && specs.some((s) => s.facts.some((f) => `fact:${f.key}` === a && f.per !== "case"))).length;
  return n + 10 * pairs + g.entries.length * (g.entries.length + somes * perItem) * Math.sqrt(pairs);
}, 0);

// The values each of a group's split-on facts is compared with, as value numbers (see Group.reps).
export function repsOf(specs: Spec[], g: Group, dom: Record<string, Domain>): Record<string, Reps> {
  // The same conditions reads() follows: a list's own rules, and what a sum adds up, down to the spec's own sums.
  const said = new Map<string, Set<string>>(), lists = new Set<string>(), sums = new Set<string>();
  const list = (s: Spec, key: string) => {
    if (lists.has(`${specs.indexOf(s)} ${key}`)) return;
    lists.add(`${specs.indexOf(s)} ${key}`);
    const col = s.collections.find((x) => x.key === key);
    if (col?.empty_ok_when) walk(s, col.empty_ok_when);
    if (col?.counts_when) walk(s, col.counts_when);
  };
  // Numbers are never split on; only the conditions a sum reads compare values.
  const terms = (s: Spec, ts: Term[]) => {
    for (const t of ts) {
      if ("sum_over" in t) {
        list(s, t.sum_over);
        if (t.where) walk(s, t.where);
      } else if ("computed" in t && !sums.has(`${specs.indexOf(s)} ${t.computed}`)) {
        sums.add(`${specs.indexOf(s)} ${t.computed}`);
        terms(s, s.computed.find((x) => x.key === t.computed)?.sum ?? []);
      }
    }
  };
  const walk = (s: Spec, c: Condition) => {
    if ("all" in c) c.all.forEach((x) => walk(s, x));
    else if ("any" in c) c.any.forEach((x) => walk(s, x));
    else if ("not" in c) walk(s, c.not);
    else if ("some" in c) {
      list(s, c.some);
      walk(s, c.where);
    } else if ("sum" in c) terms(s, c.sum);
    else if ("at_least" in c) {
      if ("computed" in c) terms(s, [{ computed: c.computed }]);
    } else {
      const key = "fact" in c ? `fact:${c.fact}` : `computed:${c.computed}`, m = said.get(key) ?? said.set(key, new Set()).get(key)!;
      if ("is" in c) m.add(c.is);
      else if ("in" in c) for (const v of typeof c.in === "string" ? s.lists[c.in] ?? [] : c.in) m.add(v);
    }
  };
  for (const e of g.entries) walk(specs[e.side], e.rule.when);
  const out: Record<string, Reps> = {};
  for (const atom of g.split) {
    if (atom.startsWith("items:")) continue;
    const d = dom[atom.slice(atom.indexOf(":") + 1)], unknown = d.labels.length - 1;
    const named = [...(said.get(atom) ?? [])].map((v) => d.values.indexOf(v)).filter((i) => i >= 0);
    const other = [...Array(unknown).keys()].find((i) => !named.includes(i));
    out[atom] = { values: [...new Set([...named, ...(other === undefined ? [] : [other]), unknown])].sort((a, b) => a - b), other };
  }
  return out;
}

// The value a group sees when a split-on fact is fixed to `v`: v itself if the group tells it apart, otherwise
// the value standing for all the ones it doesn't.
export function seenAs(g: Group, atom: string, v: number) {
  const r = g.reps[atom];
  return !r || r.values.includes(v) ? v : r.other!;
}

// The groups for these specs' rules. Every list's emptiness is split on. Then the case facts and computed facts
// read by the most rules are added one by one, and the first so many of them that cost least are kept. A fact that
// doesn't pay yet stays in while the next ones are tried: one fact alone often splits nothing where two together
// do. Last, a split-on fact only one group reads is let go again.
// "whole" makes one group of the whole SOP and "split-all" splits on every shared fact the limit allows; tests use
// both to check every way of grouping gives the same answers.
export type Grouping = "auto" | "whole" | "split-all";
export function slice(specs: Spec[], dom: Record<string, Domain>, how: Grouping = "auto"): { groups: Group[]; split: string[] } {
  const entries: Entry[] = specs.flatMap((s, side) => s.rules.map((rule) => ({ rule, side, reads: reads(s, rule.when) })));
  // A list one version adds up ties the other version's rules about it together too: they read one case.
  const added = new Set(specs.flatMap((s) => s.collections.filter((c) => summed(s, c.key)).map((c) => c.key)));
  for (const e of entries) for (const a of [...e.reads]) if (a.startsWith("items:") && added.has(a.slice(6))) e.reads.add(`list:${a.slice(6)}`);
  if (how === "whole") {
    // One group with everything, for checking that the groups give the same answers.
    const all = new Set(entries.flatMap((e) => [...e.reads]));
    return { groups: entries.length ? [{ entries, reads: all, split: [], reps: {} }] : [], split: [] };
  }
  const split = new Set(entries.flatMap((e) => [...e.reads].filter((a) => a.startsWith("items:"))));
  let combos = [...split].reduce((n, a) => n * splitSize(a, dom), 1);
  let best = { split: [...split], gs: groups(entries, split) };
  const perCase = new Set(specs.flatMap((s) => [...s.facts.filter((f) => f.per === "case" && !f.numeric).map((f) => `fact:${f.key}`),
                                                ...s.computed.filter((c) => !c.numeric).map((c) => `computed:${c.key}`)]));
  const readers = (a: string) => entries.filter((e) => e.reads.has(a)).length;
  const hubs = [...perCase].filter((a) => readers(a) > 1).sort((a, b) => readers(b) - readers(a));
  // A yes-or-no fact read by a tenth of the rules or more is worth splitting on when that shrinks the largest group
  // by a quarter: it costs little (yes, no or unknown), and the cost estimate below is rough enough to miss that.
  // When the rules are tangled anyway, splitting only multiplies the questions about the same big group.
  const largest = (gs: Group[]) => Math.max(0, ...gs.map((g) => g.entries.length));
  for (const atom of hubs.filter((a) => splitSize(a, dom) <= 3 && readers(a) >= Math.max(5, entries.length / 10))) {
    if (combos * splitSize(atom, dom) > MAX_COMBINATIONS) continue;
    const gs = groups(entries, new Set([...split, atom]));
    if (how !== "split-all" && largest(gs) > 0.75 * largest(best.gs) && cost(gs, specs, dom) >= cost(best.gs, specs, dom)) continue;
    split.add(atom);
    combos *= splitSize(atom, dom);
    best = { split: [...split], gs };
  }
  for (const atom of hubs.filter((a) => !split.has(a))) {
    if (combos * splitSize(atom, dom) > MAX_COMBINATIONS) continue;
    split.add(atom);
    combos *= splitSize(atom, dom);
    const gs = groups(entries, split);
    if (how === "split-all" || cost(gs, specs, dom) < cost(best.gs, specs, dom)) best = { split: [...split], gs };
  }
  // A split-on fact only one group reads ties nothing together; fixing it first only multiplies the questions
  // about every other group (an SOP with a list per section would fix 2^k emptinesses).
  const shared = best.split.filter((a) => best.gs.filter((g) => g.reads.has(a)).length > 1);
  for (const g of best.gs) { g.split = g.split.filter((a) => shared.includes(a)); g.reps = repsOf(specs, g, dom); }
  return { groups: best.gs, split: shared.sort() };
}

// The part of a spec one group needs: its rules, and only the facts, lists and computed facts they read.
export function subSpec(spec: Spec, group: Group, side = 0): Spec {
  const r = group.reads;
  const facts = spec.facts.filter((f) => r.has(`fact:${f.key}`));
  const lists = new Set([...facts.filter((f) => f.per !== "case").map((f) => f.per),
                         ...[...r].filter((a) => a.startsWith("items:")).map((a) => a.slice(6))]);
  return { ...spec, rules: group.entries.filter((e) => e.side === side).map((e) => e.rule), facts,
           collections: spec.collections.filter((c) => lists.has(c.key)), computed: spec.computed.filter((c) => r.has(`computed:${c.key}`)) };
}
