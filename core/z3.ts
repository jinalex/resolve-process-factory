// Z3 reads the same spec the evaluator runs and checks the SOP itself, over every possible case at once.
// The encoding mirrors the evaluator: each fact is one of its values or unknown, conditions use three-valued
// logic, and the most severe outcome in the spec's order wins. A test checks the two agree case by case.
import { type Context, init } from "z3-solver";
import { type Case, read } from "./evaluate.ts";
import type { Condition, Outcome, Spec } from "./spec.ts";

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
    else if ("fact" in c) {
      const m = (mentioned[c.fact] ??= new Set());
      if ("is" in c) m.add(c.is);
      else if ("in" in c) for (const v of typeof c.in === "string" ? s.lists[c.in] : c.in) m.add(v);
    }
  };
  for (const s of [spec, ...also]) {
    s.rules.forEach((r) => walk(s, r.when));
    s.collections.forEach((c) => c.empty_ok_when && walk(s, c.empty_ok_when));
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
    const vals = declared(f.key);
    out[f.key] = vals.length ? make(vals, false) : make([...(mentioned[f.key] ?? [])], true);
  }
  for (const c of spec.computed) if (!c.numeric) out[c.key] = make(c.values ?? ["yes", "no"], false);
  return out;
}

// One symbolic case: every case fact, and every fact of up to `slots` items in each list, is a solver variable.
export type Slot = { present: B; facts: Record<string, I> };
export type SymCase = {
  tag: string;
  facts: Record<string, I>;
  items: Record<string, Slot[]>;
  computed: Record<string, I>;
  numeric: Record<string, { known: B; value: R }>;      // numbers may be fractional, e.g. $42.50
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
    const facts: Record<string, I> = {}, computed: Record<string, I> = {}, numeric: SymCase["numeric"] = {}, items: SymCase["items"] = {};
    for (const f of this.spec.facts) if (f.per === "case") facts[f.key] = v(f.key, `${f.key}_${tag}`);
    for (const col of this.spec.collections) {
      const slots = items[col.key] = [...Array(this.slots).keys()].map((i) => ({
        present: Bool.const(`${col.key}${i}_${tag}`),
        facts: Object.fromEntries(this.spec.facts.filter((f) => f.per === col.key).map((f) => [f.key, v(f.key, `${f.key}${i}_${tag}`)])),
      }));
      // Items fill the slots in order, so "two people" always means slots 0 and 1.
      for (let i = 1; i < slots.length; i++) domain.push(this.ctx.Implies(slots[i].present, slots[i - 1].present));
    }
    for (const c of this.spec.computed) {
      if (c.numeric) { const value = Real.const(`${c.key}_${tag}`); numeric[c.key] = { known: Bool.const(`${c.key}_known_${tag}`), value }; }
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
      const xs = slots.map((slot, i) => ({ present: slot.present, ...this.cond(c.where, s, { list: c.some, i }) }));
      const none = And(...slots.map((x) => Not(x.present)));
      const okWhen = this.spec.collections.find((x) => x.key === c.some)?.empty_ok_when;
      const emptyOk = okWhen ? this.cond(okWhen, s).y : Bool.val(false);
      return {
        y: Or(...xs.map((x) => And(x.present, x.y))),
        // With no items, "some item" fails only where the spec says an empty list is fine; otherwise it's unknown.
        n: And(...xs.map((x) => this.ctx.Implies(x.present, x.n)), Or(Not(none), emptyOk)),
      };
    }
    if ("fact" in c) {
      const x = s.facts[c.fact] ?? s.items[at!.list][at!.i].facts[c.fact];
      const unk = x.eq(this.unk(c.fact));
      if ("is_unknown" in c) return { y: unk, n: Not(unk) };
      const vals = "is" in c ? [c.is] : typeof c.in === "string" ? this.spec.lists[c.in] : c.in;
      const yes = this.isOneOf(c.fact, vals, x);
      return { y: yes, n: And(Not(yes), Not(unk)) };
    }
    if ("at_least" in c) { const k = s.numeric[c.computed]; return { y: And(k.known, k.value.ge(c.at_least)), n: And(k.known, k.value.lt(c.at_least)) }; }
    const x = s.computed[c.computed];
    const yes = this.isOneOf(c.computed, [c.is], x);
    return { y: yes, n: And(Not(yes), Not(x.eq(this.unk(c.computed)))) };
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
    return [
      ...Object.entries(a.facts).map(([k, x]) => same(k, x, b.facts[k])),
      ...Object.entries(a.items).flatMap(([list, slots]) => slots.flatMap((p, i) => [p.present.eq(b.items[list][i].present),
        ...Object.entries(p.facts).map(([k, x]) => same(k, x, b.items[list][i].facts[k]))])),
      ...Object.entries(a.computed).map(([k, x]) => same(k, x, b.computed[k])),
      ...Object.entries(a.numeric).map(([k, x]) => And(b.numeric[k].known, this.ctx.Implies(x.known, b.numeric[k].value.eq(x.value)))),
    ];
  }

  // How many of the case's facts are unknown, counting only items that are present.
  unknownCount(s: SymCase): I {
    const { If, And, Int, Sum } = this.ctx;
    const one = (b: B) => If(b, Int.val(1), Int.val(0)) as I;
    return Sum(Int.val(0),
      ...Object.entries(s.facts).map(([k, x]) => one(x.eq(this.unk(k)))),
      ...Object.values(s.items).flatMap((slots) => slots.flatMap((p) => Object.entries(p.facts).map(([k, x]) => one(And(p.present, x.eq(this.unk(k))))))),
      ...Object.entries(s.computed).map(([k, x]) => one(x.eq(this.unk(k)))),
      ...Object.values(s.numeric).map((x) => one(this.ctx.Not(x.known)))) as I;
  }

  // Constraints pinning a symbolic case to one concrete case, so Z3's outcome can be compared with the evaluator's.
  // The case must fit in the slots.
  pin(s: SymCase, c: Case): B[] {
    const { And, Not } = this.ctx;
    const out: B[] = Object.entries(s.facts).map(([k, x]) => x.eq(this.idx(k, read(c.facts[k]))));
    for (const [list, slots] of Object.entries(s.items)) {
      const items = c.items[list] ?? [];
      if (items.length > slots.length) throw new Error(`The case has ${items.length} ${list}, more than the ${slots.length} slots.`);
      slots.forEach((slot, i) => out.push(items[i]
        ? And(slot.present, ...Object.entries(slot.facts).map(([k, x]) => x.eq(this.idx(k, read(items[i][k])))))
        : Not(slot.present)));
    }
    for (const [k, x] of Object.entries(s.computed)) out.push(x.eq(this.idx(k, read(c.computed[k] as string))));
    for (const [k, x] of Object.entries(s.numeric)) {
      const v = c.computed[k];
      out.push(typeof v === "number" && Number.isFinite(v) ? And(x.known, x.value.eq(v)) : Not(x.known));
    }
    return out;
  }

  // Reads a solver model back into plain facts, for the example shown to a person.
  readCase(m: { eval: (x: never) => { toString(): string } }, s: SymCase) {
    const val = (fact: string, x: I) => this.dom[fact].labels[Number(m.eval(x as never).toString())];
    return {
      facts: Object.fromEntries(Object.entries(s.facts).map(([k, x]) => [k, val(k, x)])),
      items: Object.fromEntries(Object.entries(s.items).map(([list, slots]) => [list,
        slots.filter((p) => m.eval(p.present as never).toString() === "true")
          .map((p) => Object.fromEntries(Object.entries(p.facts).map(([k, x]) => [k, val(k, x)])))])),
      computed: {
        ...Object.fromEntries(Object.entries(s.computed).map(([k, x]) => [k, val(k, x)])),
        ...Object.fromEntries(Object.entries(s.numeric).map(([k, x]) =>
          [k, m.eval(x.known as never).toString() === "true" ? number(m.eval(x.value as never).toString()) : UNKNOWN])),
      },
    };
  }
}

export async function shutdown() {
  if (z3) { z3.em.PThread.terminateAllThreads(); z3 = null; }
}
