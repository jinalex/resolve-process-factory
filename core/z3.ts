// Z3 reads the same spec the evaluator runs and checks the SOP itself, over every possible case at once.
// The encoding mirrors the evaluator: each fact is one of its values or unknown, conditions use three-valued
// logic, and the most severe outcome in the spec's order wins. A test checks the two agree case by case.
import { type Context, init } from "z3-solver";
import { type Case, readComputed, readFact } from "./evaluate.ts";
import { cmp, frac, fromNumber, fromValue } from "./frac.ts";
import type { Condition, Outcome, Spec, Term } from "./spec.ts";

type Z3 = Awaited<ReturnType<typeof init>>;
type Ctx = Context<"resolve">;
export type B = ReturnType<Ctx["Bool"]["const"]>;
export type I = ReturnType<Ctx["Int"]["const"]>;
type R = ReturnType<Ctx["Real"]["const"]>;

let z3: { ctx: Ctx; em: Z3["em"] } | null = null;
export async function z3Context() {
  if (!z3) { const api = await init(); z3 = { ctx: api.Context("resolve"), em: api.em }; }
  return z3.ctx;
}

// One Z3 context serves the whole process, and it can't work on two questions at once: two checks run together
// (under Promise.all) crash Z3. Every check that uses the context runs through here, one after another.
let queue: Promise<unknown> = Promise.resolve();
export function oneAtATime<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.then(run);
  queue = next.catch(() => undefined);
  return next;
}

const UNKNOWN = "unknown";
// Z3 prints a real as "17" or "85/2". A fraction a decimal holds exactly becomes a number; any other, like 1/3,
// stays "1/3" so the evaluator reads the same value Z3 meant.
const number = (s: string): number | string => {
  const [a, b = "1"] = s.split("/");
  let d = BigInt(b);
  while (d % 2n === 0n) d /= 2n;
  while (d % 5n === 0n) d /= 5n;
  if (d !== 1n) return s;
  // A float only when it reads back exactly; otherwise a threshold could move.
  const x = Number(a) / Number(b);
  return Number.isFinite(x) && cmp(fromNumber(x), frac(BigInt(a), BigInt(b))) === 0 ? x : s;
};

// The values a fact can take, numbered in this order: its real values, then for an open fact (like country) one
// value standing for every other, then unknown. `labels` names each number, for examples and show-z3.
export type Domain = { values: string[]; open: boolean; labels: string[] };

// Every fact's domain. An open fact's values are the ones the rules and collections mention. `also` adds the
// values another version of the spec mentions, so two versions can read one symbolic case.
export function domains(spec: Spec, also: Spec[] = []): Record<string, Domain> {
  const mentioned: Record<string, Set<string>> = {};
  const walk = (s: Spec, c: Condition) => {
    if ("all" in c) c.all.forEach((x) => walk(s, x));
    else if ("any" in c) c.any.forEach((x) => walk(s, x));
    else if ("not" in c) walk(s, c.not);
    else if ("some" in c) walk(s, c.where);
    else if ("sum" in c) c.sum.forEach((t) => "sum_over" in t && t.where && walk(s, t.where));
    else if ("fact" in c && !("at_least" in c)) {
      const m = (mentioned[c.fact] ??= new Set());
      if ("is" in c) m.add(c.is);
      else if ("in" in c) for (const v of typeof c.in === "string" ? s.lists[c.in] : c.in) m.add(v);
    }
  };
  for (const s of [spec, ...also]) {
    s.rules.forEach((r) => walk(s, r.when));
    s.collections.forEach((c) => { if (c.empty_ok_when) walk(s, c.empty_ok_when); if (c.counts_when) walk(s, c.counts_when); });
    s.computed.forEach((c) => c.sum && walk(s, { sum: c.sum, at_least: 0 }));
  }
  const declared = (key: string) => [...new Set([spec, ...also].flatMap((s) => s.facts.find((f) => f.key === key)?.values ?? []))];
  const make = (values: string[], open: boolean): Domain => {
    // "unknown" can't be a real value: the evaluator reads it as unknown.
    values = values.filter((v) => v !== UNKNOWN);
    const other = values.includes("other") ? "something else" : "other";
    return { values, open, labels: [...values, ...(open ? [other] : []), UNKNOWN] };
  };
  const out: Record<string, Domain> = {};
  for (const f of spec.facts) {
    if (f.numeric) continue;
    const vals = declared(f.key);
    out[f.key] = vals.length ? make(vals, false) : make([...(mentioned[f.key] ?? [])], true);
  }
  for (const c of spec.computed) if (!c.numeric) out[c.key] = make(c.values ?? ["yes", "no"], false);
  return out;
}

// One symbolic case: every case fact, and every fact of up to `slots` items in each list, is a solver variable.
export type Num = { known: B; value: R };
export type Slot = { present: B; facts: Record<string, I>; numeric: Record<string, Num> };
export type SymCase = {
  tag: string;
  facts: Record<string, I>;
  items: Record<string, Slot[]>;
  listed: Record<string, B>;      // whether the case gives each list at all; an empty list is given
  computed: Record<string, I>;
  numeric: Record<string, Num>;   // numeric case facts and computed facts; may be fractional, e.g. $42.50
  domain: B[];                    // constraints keeping every variable inside its values
};
type Scope = { list: string; i: number } | null;

export class Encoder {
  readonly dom: Record<string, Domain>;
  readonly ctx: Ctx;
  readonly spec: Spec;
  readonly slots: number;
  constructor(ctx: Ctx, spec: Spec, slots = 2, dom = domains(spec)) { this.ctx = ctx; this.spec = spec; this.slots = slots; this.dom = dom; }

  // A case's value as a number. A value outside the fact's values is "any other" when the fact is open, and
  // unknown when it is closed, the same way the evaluator reads it.
  idx(fact: string, v: string) {
    const d = this.dom[fact];
    if (v === UNKNOWN) return this.unk(fact);
    const i = d.values.indexOf(v);
    if (i >= 0) return i;
    return d.open ? d.values.length : this.unk(fact);
  }
  unk(fact: string) { return this.dom[fact].labels.length - 1; }

  // "The fact is one of these values", for the values a rule compares with. A value the fact can't take
  // never matches; it must not become a match for unknown.
  isOneOf(fact: string, vals: string[], x: I): B {
    const is = vals.map((v) => this.dom[fact].values.indexOf(v)).filter((i) => i >= 0).map((i) => x.eq(i));
    return is.length ? this.ctx.Or(...is) : this.ctx.Bool.val(false);
  }

  symCase(tag: string): SymCase {
    const { Int, Real, Bool, And } = this.ctx;
    const domain: B[] = [];
    const v = (fact: string, name: string) => { const x = Int.const(name); domain.push(And(x.ge(0), x.le(this.unk(fact)))); return x; };
    const n = (name: string): Num => { const value = Real.const(name); return { known: Bool.const(`${name}_known`), value }; };
    const facts: Record<string, I> = {}, computed: Record<string, I> = {}, numeric: SymCase["numeric"] = {}, items: SymCase["items"] = {};
    const listed: SymCase["listed"] = {};
    for (const f of this.spec.facts) if (f.per === "case") {
      if (f.numeric) numeric[f.key] = n(`${f.key}_${tag}`); else facts[f.key] = v(f.key, `${f.key}_${tag}`);
    }
    for (const col of this.spec.collections) {
      const slots = items[col.key] = [...Array(this.slotted(col.key) ? this.slots : 0).keys()].map((i) => ({
        present: Bool.const(`${col.key}${i}_${tag}`),
        facts: Object.fromEntries(this.spec.facts.filter((f) => f.per === col.key && !f.numeric).map((f) => [f.key, v(f.key, `${f.key}${i}_${tag}`)])),
        numeric: Object.fromEntries(this.spec.facts.filter((f) => f.per === col.key && f.numeric).map((f) => [f.key, n(`${f.key}${i}_${tag}`)])),
      }));
      // Items fill the slots in order, so "two people" always means slots 0 and 1. A list with items is given.
      for (let i = 1; i < slots.length; i++) domain.push(this.ctx.Implies(slots[i].present, slots[i - 1].present));
      listed[col.key] = Bool.const(`${col.key}_listed_${tag}`);
      if (slots.length) domain.push(this.ctx.Implies(slots[0].present, listed[col.key]));
    }
    for (const c of this.spec.computed) {
      if (c.sum) continue;           // the spec works it out from other numbers: see term()
      if (c.numeric) numeric[c.key] = n(`${c.key}_${tag}`);
      else computed[c.key] = v(c.key, `${c.key}_${tag}`);
    }
    return { tag, facts, items, listed, computed, numeric, domain };
  }

  // A condition becomes two formulas: "it holds" and "it fails". Neither means it might hold (unknown).
  cond(c: Condition, s: SymCase, at: Scope = null): { y: B; n: B } {
    const { And, Or, Not, Bool } = this.ctx;
    if ("all" in c) { const xs = c.all.map((x) => this.cond(x, s, at)); return { y: And(...xs.map((x) => x.y)), n: Or(...xs.map((x) => x.n)) }; }
    if ("any" in c) { const xs = c.any.map((x) => this.cond(x, s, at)); return { y: Or(...xs.map((x) => x.y)), n: And(...xs.map((x) => x.n)) }; }
    if ("not" in c) { const x = this.cond(c.not, s, at); return { y: x.n, n: x.y }; }
    if ("some" in c) {
      const slots = s.items[c.some];
      // An item the rules are about: present, and the list's `counts_when` holds (or might).
      const xs = slots.map((slot, i) => {
        const m = this.counts(c.some, s, i), w = this.cond(c.where, s, { list: c.some, i });
        return { present: slot.present, counts: m.y, y: And(m.y, w.y), n: Or(m.n, w.n) };
      });
      // As in the evaluator: the list counts as possibly empty unless some present item certainly counts.
      const none = And(...xs.map((x) => Or(Not(x.present), Not(x.counts))));
      const okWhen = this.spec.collections.find((x) => x.key === c.some)?.empty_ok_when;
      const emptyOk = okWhen ? this.cond(okWhen, s).y : Bool.val(false);
      return {
        y: Or(...xs.map((x) => And(x.present, x.y))),
        // With no items, "some item" fails only where the spec says an empty list is fine; otherwise it's unknown.
        n: And(...xs.map((x) => this.ctx.Implies(x.present, x.n)), Or(Not(none), emptyOk)),
      };
    }
    if ("sum" in c || ("fact" in c && "at_least" in c) || ("computed" in c && "at_least" in c)) {
      const t = "sum" in c ? this.sum(c.sum, s, at) : this.term("fact" in c ? { fact: c.fact } : { computed: c.computed }, s, at);
      const f = fromValue(c.at_least)!, bar = this.ctx.Real.val(`${f.n}/${f.d}`);   // 0.1 is 1/10, as in the evaluator
      return { y: And(t.known, t.value.ge(bar)), n: And(t.known, t.value.lt(bar)) };
    }
    if ("fact" in c) {
      const num = this.numFact(c.fact, s, at);
      if (num) return { y: Not(num.known), n: num.known };   // only "is_unknown" can ask about a number's value
      return this.valueCond(c as Parameters<Encoder["valueCond"]>[0], s.facts[c.fact] ?? s.items[at!.list][at!.i].facts[c.fact]);
    }
    const x = s.computed[c.computed];
    const yes = this.isOneOf(c.computed, [c.is], x);
    return { y: yes, n: And(Not(yes), Not(x.eq(this.unk(c.computed)))) };
  }

  // A condition on a fact that takes one of its values, `x` being that fact's variable in the case or in an item.
  valueCond(c: Exclude<Extract<Condition, { fact: string }>, { at_least: number }>, x: I): { y: B; n: B } {
    const { And, Or, Not } = this.ctx;
    // Comparing two versions, the values are both versions' values; one this version doesn't have is unknown
    // to it, as in the evaluator.
    const own = this.spec.facts.find((f) => f.key === c.fact)?.values;
    const foreign = own?.length ? this.dom[c.fact].values.filter((v) => !own.includes(v)).map((v) => x.eq(this.dom[c.fact].values.indexOf(v))) : [];
    const unk = Or(x.eq(this.unk(c.fact)), ...foreign);
    if ("is_unknown" in c) return { y: unk, n: Not(unk) };
    const vals = "is" in c ? [c.is] : typeof c.in === "string" ? this.spec.lists[c.in] : c.in;
    const yes = this.isOneOf(c.fact, vals, x);
    return { y: yes, n: And(Not(yes), Not(unk)) };
  }

  // Whether a list's items are slots. The quantified encoder (core/z3-quantified.ts) gives most lists none.
  slotted(_list: string) { return true; }

  // Whether item i of a list counts: its list's `counts_when`, or always.
  counts(list: string, s: SymCase, i: number): { y: B; n: B } {
    const when = this.spec.collections.find((x) => x.key === list)?.counts_when;
    return when ? this.cond(when, s, { list, i }) : { y: this.ctx.Bool.val(true), n: this.ctx.Bool.val(false) };
  }

  // A numeric fact of the case as a whole, which a case keeps in `facts`, not `computed`.
  caseFact(key: string) { return this.spec.facts.some((f) => f.key === key && f.per === "case" && f.numeric); }

  numFact(key: string, s: SymCase, at: Scope): Num | undefined {
    return s.numeric[key] ?? (at ? s.items[at.list][at.i].numeric[key] : undefined);
  }

  // A number in a condition, and whether it's known, mirroring the evaluator's term().
  term(t: Term, s: SymCase, at: Scope): Num {
    const { And, Or, Not, If, Real, Sum, Bool } = this.ctx;
    if ("sum_over" in t) {
      const parts = s.items[t.sum_over].map((slot, i) => {
        const m = this.counts(t.sum_over, s, i);
        const w = t.where ? this.cond(t.where, s, { list: t.sum_over, i }) : { y: Bool.val(true), n: Bool.val(false) };
        const inc = And(slot.present, m.y, w.y), out = Or(Not(slot.present), m.n, w.n);
        const x = slot.numeric[t.of];
        return { known: And(Or(inc, out), this.ctx.Implies(inc, x.known)), value: If(inc, x.value, Real.val(0)) as R };
      });
      // As in the evaluator: a list the case doesn't give adds up to unknown, unless the spec says an empty list is fine.
      const okWhen = this.spec.collections.find((x) => x.key === t.sum_over)?.empty_ok_when;
      const given = okWhen ? Or(s.listed[t.sum_over], this.cond(okWhen, s).y) : s.listed[t.sum_over];
      return { known: And(given, ...parts.map((p) => p.known)), value: Sum(Real.val(0), ...parts.map((p) => p.value)) as R };
    }
    if ("fact" in t) return this.numFact(t.fact, s, at)!;
    const def = this.spec.computed.find((x) => x.key === t.computed)?.sum;
    return def ? this.sum(def, s, null) : s.numeric[t.computed];
  }
  sum(terms: Term[], s: SymCase, at: Scope): Num {
    const xs = terms.map((t) => this.term(t, s, at));
    return { known: this.ctx.And(...xs.map((x) => x.known)), value: this.ctx.Sum(this.ctx.Real.val(0), ...xs.map((x) => x.value)) as R };
  }

  // Whether each rule applies or might apply, and the outcome, as an index into spec.order.
  run(s: SymCase) {
    const { Or, And, Not, If, Int } = this.ctx;
    const rules = this.spec.rules.map((r) => { const { y, n } = this.cond(r.when, s); return { rule: r, applies: y, might: And(Not(y), Not(n)) }; });
    const reaches = (o: Outcome) => Or(...rules.filter((r) => r.rule.then === o).map((r) => r.applies),
                                       ...(o === this.spec.unknowns.then ? rules.map((r) => r.might) : []));
    let outcome: I = Int.val(this.spec.order.length - 1);
    for (let i = this.spec.order.length - 2; i >= 0; i--) outcome = If(reaches(this.spec.order[i]), Int.val(i), outcome) as I;
    return { rules, outcome };
  }

  // Constraints saying `b` agrees with `a` on every known value and has no unknowns of its own.
  completes(a: SymCase, b: SymCase): B[] {
    const { And, Or } = this.ctx;
    const same = (fact: string, x: I, y: I) => And(Or(x.eq(this.unk(fact)), y.eq(x)), y.neq(this.unk(fact)));
    const sameNum = (x: Num, y: Num) => And(y.known, this.ctx.Implies(x.known, y.value.eq(x.value)));
    return [
      ...Object.entries(a.facts).map(([k, x]) => same(k, x, b.facts[k])),
      ...Object.entries(a.items).flatMap(([list, slots]) => slots.flatMap((p, i) => [p.present.eq(b.items[list][i].present),
        ...Object.entries(p.facts).map(([k, x]) => same(k, x, b.items[list][i].facts[k])),
        ...Object.entries(p.numeric).map(([k, x]) => sameNum(x, b.items[list][i].numeric[k]))])),
      ...Object.values(b.listed),
      ...Object.entries(a.computed).map(([k, x]) => same(k, x, b.computed[k])),
      ...Object.entries(a.numeric).map(([k, x]) => sameNum(x, b.numeric[k])),
    ];
  }

  // How many of the case's facts are unknown, counting only items that are present.
  unknownCount(s: SymCase): I {
    const { If, And, Int, Sum } = this.ctx;
    const one = (b: B) => If(b, Int.val(1), Int.val(0)) as I;
    return Sum(Int.val(0),
      ...Object.entries(s.facts).map(([k, x]) => one(x.eq(this.unk(k)))),
      ...Object.values(s.listed).map((x) => one(this.ctx.Not(x))),
      ...Object.values(s.items).flatMap((slots) => slots.flatMap((p) => [
        ...Object.entries(p.facts).map(([k, x]) => one(And(p.present, x.eq(this.unk(k))))),
        ...Object.values(p.numeric).map((x) => one(And(p.present, this.ctx.Not(x.known))))])),
      ...Object.entries(s.computed).map(([k, x]) => one(x.eq(this.unk(k)))),
      ...Object.values(s.numeric).map((x) => one(this.ctx.Not(x.known)))) as I;
  }

  // Constraints pinning a symbolic case to one concrete case, so Z3's outcome can be compared with the evaluator's.
  // The case must fit in the slots.
  pin(s: SymCase, c: Case): B[] {
    const { And, Not } = this.ctx;
    const { Real } = this.ctx;
    const n = (x: Num, v: unknown) => { const f = fromValue(v); return f ? And(x.known, x.value.eq(Real.val(`${f.n}/${f.d}`))) : Not(x.known); };
    const out: B[] = Object.entries(s.facts).map(([k, x]) => x.eq(this.idx(k, readFact(this.spec, k, c.facts[k]))));
    for (const [list, slots] of Object.entries(s.items)) {
      const items = c.items[list] ?? [];
      out.push(c.items[list] == null ? Not(s.listed[list]) : s.listed[list]);
      if (items.length > slots.length) throw new Error(`The case has ${items.length} ${list}, more than the ${slots.length} slots.`);
      slots.forEach((slot, i) => out.push(items[i]
        ? And(slot.present, ...Object.entries(slot.facts).map(([k, x]) => x.eq(this.idx(k, readFact(this.spec, k, items[i][k])))),
              ...Object.entries(slot.numeric).map(([k, x]) => n(x, items[i][k])))
        : Not(slot.present)));
    }
    for (const [k, x] of Object.entries(s.computed)) out.push(x.eq(this.idx(k, readComputed(c.computed[k]))));
    for (const [k, x] of Object.entries(s.numeric)) out.push(n(x, this.caseFact(k) ? c.facts[k] : c.computed[k]));
    return out;
  }

  // Whether the case gives a list any items.
  anyItem(s: SymCase, list: string): B { return s.items[list]?.[0]?.present ?? this.ctx.Bool.val(false); }

  // Constraints saying two copies have the same items with the same facts, except `fact` in the first item.
  sameItemsExcept(a: SymCase, b: SymCase, fact: string): B[] {
    const { And } = this.ctx;
    const sameNum = (x: Num, y: Num) => And(x.known.eq(y.known), x.value.eq(y.value));
    return Object.entries(a.items).flatMap(([list, slots]) => slots.flatMap((p, i) => [p.present.eq(b.items[list][i].present),
      ...Object.keys(p.facts).filter((k) => !(i === 0 && k === fact)).map((k) => p.facts[k].eq(b.items[list][i].facts[k])),
      ...Object.keys(p.numeric).filter((k) => !(i === 0 && k === fact)).map((k) => sameNum(p.numeric[k], b.items[list][i].numeric[k]))]));
  }

  // For a short example: at most one item in each list.
  oneItemEach(s: SymCase): B[] {
    return [this.ctx.And(...Object.values(s.items).flatMap((slots) => slots.slice(1).map((x) => this.ctx.Not(x.present))))];
  }

  // For a short example: constraints that each make one item fact known, tried one at a time.
  itemsKnown(s: SymCase): B[] {
    return Object.values(s.items).flatMap((slots) => slots.flatMap((p) => [
      ...Object.entries(p.facts).map(([k, x]) => this.ctx.Implies(p.present, x.neq(this.unk(k)))),
      ...Object.values(p.numeric).map((x) => this.ctx.Implies(p.present, x.known))]));
  }

  // A numeral's own string is "p/q" or "p"; toString() can print "(/ 1.0 4.0)" instead.
  readNum(m: { eval: (x: never, complete?: never) => { toString(): string } }, x: Num) {
    return m.eval(x.known as never, true as never).toString() === "true"
      ? number((m.eval(x.value as never, true as never) as unknown as { asString(): string }).asString()) : UNKNOWN;
  }

  // Reads a solver model back into plain facts, for the example shown to a person.
  readCase(m: { eval: (x: never, complete?: never) => { toString(): string } }, s: SymCase) {
    const val = (fact: string, x: I) => this.dom[fact].labels[Number(m.eval(x as never).toString())];
    const num = (x: Num) => this.readNum(m, x);
    return {
      facts: { ...Object.fromEntries(Object.entries(s.facts).map(([k, x]) => [k, val(k, x)])),
               ...Object.fromEntries(Object.entries(s.numeric).filter(([k]) => this.caseFact(k)).map(([k, x]) => [k, num(x)])) },
      items: Object.fromEntries(Object.entries(s.items).map(([list, slots]) => [list,
        m.eval(s.listed[list] as never).toString() !== "true" ? null : slots.filter((p) => m.eval(p.present as never).toString() === "true")
          .map((p) => ({ ...Object.fromEntries(Object.entries(p.facts).map(([k, x]) => [k, val(k, x)])),
                         ...Object.fromEntries(Object.entries(p.numeric).map(([k, x]) => [k, num(x)])) }))])),
      computed: {
        ...Object.fromEntries(Object.entries(s.computed).map(([k, x]) => [k, val(k, x)])),
        ...Object.fromEntries(Object.entries(s.numeric).filter(([k]) => !this.caseFact(k)).map(([k, x]) => [k, num(x)])),
      },
    };
  }
}

export async function shutdown() {
  if (z3) { z3.em.PThread.terminateAllThreads(); z3 = null; }
}
