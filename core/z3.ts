// Z3 reads the same spec the evaluator runs and checks the SOP itself, over every possible case at once.
// The encoding mirrors the evaluator: each fact is one of its values or unknown, conditions use three-valued
// logic, and the most severe outcome in the spec's order wins. A test checks the two agree case by case.
import { type Context, init } from "z3-solver";
import { type Case, read, readFact } from "./evaluate.ts";
import { fromNumber } from "./frac.ts";
import type { Condition, Outcome, Spec, Term } from "./spec.ts";

type Z3 = Awaited<ReturnType<typeof init>>;
type Ctx = Context<"resolve">;
type B = ReturnType<Ctx["Bool"]["const"]>;
type I = ReturnType<Ctx["Int"]["const"]>;
type R = ReturnType<Ctx["Real"]["const"]>;

let z3: { ctx: Ctx; em: Z3["em"] } | null = null;
export async function z3Context() {
  if (!z3) { const api = await init(); z3 = { ctx: api.Context("resolve"), em: api.em }; }
  return z3.ctx;
}

const UNKNOWN = "unknown";
// Z3 prints a real as "17" or "85/2".
const number = (s: string) => { const [a, b] = s.split("/").map(Number); return b ? a / b : a; };

// Every value a fact can take in this spec, plus "other" for open facts like country, plus unknown.
export function domains(spec: Spec): Record<string, string[]> {
  const mentioned: Record<string, Set<string>> = {};
  const walk = (c: Condition) => {
    if ("all" in c) c.all.forEach(walk);
    else if ("any" in c) c.any.forEach(walk);
    else if ("not" in c) walk(c.not);
    else if ("some" in c) walk(c.where);
    else if ("sum" in c) c.sum.forEach((t) => "sum_over" in t && t.where && walk(t.where));
    else if ("fact" in c && !("at_least" in c)) {
      const s = (mentioned[c.fact] ??= new Set());
      if ("is" in c) s.add(c.is);
      else if ("in" in c) for (const v of typeof c.in === "string" ? spec.lists[c.in] : c.in) s.add(v);
    }
  };
  spec.rules.forEach((r) => walk(r.when));
  spec.collections.forEach((x) => { if (x.counts_when) walk(x.counts_when); if (x.empty_ok_when) walk(x.empty_ok_when); });
  spec.computed.forEach((x) => x.sum && walk({ sum: x.sum, at_least: 0 }));
  const out: Record<string, string[]> = {};
  for (const f of spec.facts) {
    if (f.numeric) continue;
    const vals = f.values?.length ? [...f.values] : [...(mentioned[f.key] ?? []), "other"];
    out[f.key] = [...vals, UNKNOWN];
  }
  for (const c of spec.computed) if (!c.numeric) out[c.key] = [...(c.values ?? ["yes", "no"]), UNKNOWN];
  return out;
}

// One symbolic case: every case fact, and every fact of up to `slots` items in each list, is a solver variable.
export type Num = { known: B; value: R };
export type Slot = { present: B; facts: Record<string, I>; numeric: Record<string, Num> };
export type SymCase = {
  tag: string;
  facts: Record<string, I>;
  items: Record<string, Slot[]>;
  computed: Record<string, I>;
  numeric: Record<string, Num>;   // numeric case facts and computed facts; may be fractional, e.g. $42.50
  domain: B[];                    // constraints keeping every variable inside its values
};
type Scope = { list: string; i: number } | null;

export class Encoder {
  readonly dom: Record<string, string[]>;
  readonly ctx: Ctx;
  readonly spec: Spec;
  readonly slots: number;
  constructor(ctx: Ctx, spec: Spec, slots = 2) { this.ctx = ctx; this.spec = spec; this.slots = slots; this.dom = domains(spec); }

  // A value outside the fact's values is "other" when the fact is open, and unknown when it is closed,
  // the same way the evaluator reads it.
  idx(fact: string, v: string) {
    const d = this.dom[fact];
    const i = d.indexOf(v);
    if (i >= 0) return i;
    return d.includes("other") ? d.indexOf("other") : this.unk(fact);
  }
  unk(fact: string) { return this.dom[fact].length - 1; }

  symCase(tag: string): SymCase {
    const { Int, Real, Bool, And } = this.ctx;
    const domain: B[] = [];
    const v = (fact: string, name: string) => { const x = Int.const(name); domain.push(And(x.ge(0), x.le(this.unk(fact)))); return x; };
    const n = (name: string): Num => { const value = Real.const(name); domain.push(value.ge(0)); return { known: Bool.const(`${name}_known`), value }; };
    const facts: Record<string, I> = {}, computed: Record<string, I> = {}, numeric: SymCase["numeric"] = {}, items: SymCase["items"] = {};
    for (const f of this.spec.facts) if (f.per === "case") {
      if (f.numeric) numeric[f.key] = n(`${f.key}_${tag}`); else facts[f.key] = v(f.key, `${f.key}_${tag}`);
    }
    for (const col of this.spec.collections) {
      const slots = items[col.key] = [...Array(this.slots).keys()].map((i) => ({
        present: Bool.const(`${col.key}${i}_${tag}`),
        facts: Object.fromEntries(this.spec.facts.filter((f) => f.per === col.key && !f.numeric).map((f) => [f.key, v(f.key, `${f.key}${i}_${tag}`)])),
        numeric: Object.fromEntries(this.spec.facts.filter((f) => f.per === col.key && f.numeric).map((f) => [f.key, n(`${f.key}${i}_${tag}`)])),
      }));
      // Items fill the slots in order, so "two people" always means slots 0 and 1.
      for (let i = 1; i < slots.length; i++) domain.push(this.ctx.Implies(slots[i].present, slots[i - 1].present));
    }
    for (const c of this.spec.computed) {
      if (c.sum) continue;           // the spec works it out from other numbers: see term()
      if (c.numeric) numeric[c.key] = n(`${c.key}_${tag}`);
      else computed[c.key] = v(c.key, `${c.key}_${tag}`);
    }
    return { tag, facts, items, computed, numeric, domain };
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
        return { present: slot.present, out: m.n, y: And(m.y, w.y), n: Or(m.n, w.n) };
      });
      const none = And(...xs.map((x) => Or(Not(x.present), x.out)));
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
      return { y: And(t.known, t.value.ge(c.at_least)), n: And(t.known, t.value.lt(c.at_least)) };
    }
    if ("fact" in c) {
      const num = this.numFact(c.fact, s, at);
      if (num) return { y: Not(num.known), n: num.known };   // only "is_unknown" can ask about a number's value
      const x = s.facts[c.fact] ?? s.items[at!.list][at!.i].facts[c.fact];
      const unk = x.eq(this.unk(c.fact));
      if ("is_unknown" in c) return { y: unk, n: Not(unk) };
      const vals = "is" in c ? [c.is] : typeof c.in === "string" ? this.spec.lists[c.in] : c.in;
      const yes = Or(...vals.map((v) => x.eq(this.idx(c.fact, v))));
      return { y: yes, n: And(Not(yes), Not(unk)) };
    }
    const x = s.computed[c.computed];
    const yes = x.eq(this.idx(c.computed, c.is));
    return { y: yes, n: And(Not(yes), Not(x.eq(this.unk(c.computed)))) };
  }

  // Whether item i of a list counts: its list's `counts_when`, or always.
  counts(list: string, s: SymCase, i: number): { y: B; n: B } {
    const when = this.spec.collections.find((x) => x.key === list)?.counts_when;
    return when ? this.cond(when, s, { list, i }) : { y: this.ctx.Bool.val(true), n: this.ctx.Bool.val(false) };
  }

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
      return { known: And(...parts.map((p) => p.known)), value: Sum(Real.val(0), ...parts.map((p) => p.value)) as R };
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
    const exact = (v: number) => { const f = fromNumber(v); return Real.val(`${f.n}/${f.d}`); };
    const n = (x: Num, v: unknown) => (typeof v === "number" && Number.isFinite(v) ? And(x.known, x.value.eq(exact(v))) : Not(x.known));
    const out: B[] = Object.entries(s.facts).map(([k, x]) => x.eq(this.idx(k, readFact(this.spec, k, c.facts[k]))));
    for (const [list, slots] of Object.entries(s.items)) {
      const items = c.items[list] ?? [];
      if (items.length > slots.length) throw new Error(`The case has ${items.length} ${list}, more than the ${slots.length} slots.`);
      slots.forEach((slot, i) => out.push(items[i]
        ? And(slot.present, ...Object.entries(slot.facts).map(([k, x]) => x.eq(this.idx(k, readFact(this.spec, k, items[i][k])))),
              ...Object.entries(slot.numeric).map(([k, x]) => n(x, items[i][k])))
        : Not(slot.present)));
    }
    for (const [k, x] of Object.entries(s.computed)) out.push(x.eq(this.idx(k, read(c.computed[k]))));
    for (const [k, x] of Object.entries(s.numeric)) out.push(n(x, k in c.facts ? c.facts[k] : c.computed[k]));
    return out;
  }

  // Reads a solver model back into plain facts, for the example shown to a person.
  readCase(m: { eval: (x: never) => { toString(): string } }, s: SymCase) {
    const val = (fact: string, x: I) => this.dom[fact][Number(m.eval(x as never).toString())];
    const num = (x: Num) => m.eval(x.known as never).toString() === "true" ? number(m.eval(x.value as never).toString()) : UNKNOWN;
    return {
      facts: Object.fromEntries(Object.entries(s.facts).map(([k, x]) => [k, val(k, x)])),
      items: Object.fromEntries(Object.entries(s.items).map(([list, slots]) => [list,
        slots.filter((p) => m.eval(p.present as never).toString() === "true")
          .map((p) => ({ ...Object.fromEntries(Object.entries(p.facts).map(([k, x]) => [k, val(k, x)])),
                         ...Object.fromEntries(Object.entries(p.numeric).map(([k, x]) => [k, num(x)])) }))])),
      computed: {
        ...Object.fromEntries(Object.entries(s.computed).map(([k, x]) => [k, val(k, x)])),
        ...Object.fromEntries(Object.entries(s.numeric).map(([k, x]) => [k, num(x)])),
      },
    };
  }
}

export async function shutdown() {
  if (z3) { z3.em.PThread.terminateAllThreads(); z3 = null; }
}
