// Spike (option C of the SOP-check scaling work): the same encoding as core/z3.ts, but a list's items are not a
// fixed number of slots. Each list is a sort of its own, its items are whatever elements Z3 puts in that sort, and
// each item fact is a function on the sort. "Some item" becomes "there exists an item", "no item" becomes "every
// item", and Z3 picks as many items as a case needs. So no question needs a people bound, and none is capped.
//
// A list that is added up (`sum_over`) keeps its slots: a sum over however many items a sort has can't be written
// in first-order logic. Such a list gets the slots the slot encoding would give it, and the proofs say how many.
//
// What this costs: questions now have quantifiers in them, and Z3 answers those with model-based quantifier
// instantiation. The facts here only compare an item's fact with constants (no fact relates two items), which is
// the kind of formula that procedure decides, but Z3 is allowed to say "unknown", and the checks then claim nothing.
import { type Case, readFact } from "./evaluate.ts";
import { fromValue } from "./frac.ts";
import type { Condition, Spec } from "./spec.ts";
import { type B, type Domain, domains, Encoder, type I, type Num, type SymCase } from "./z3.ts";

type Ctx = Encoder["ctx"];
type Sort = ReturnType<Ctx["Sort"]["declare"]>;
type Fn = ReturnType<Ctx["Function"]["declare"]>;
type X = ReturnType<Ctx["Const"]>;

// One list's items in one copy of a case: whether an element of the list's sort is an item of this case, and
// each of its facts.
type Items = { present: Fn; facts: Record<string, Fn>; numeric: Record<string, { known: Fn; value: Fn }>; first: X; any: B };
// `named` holds a name for each quantified formula, defined in `domain`. Z3 can't always evaluate a quantifier in a
// model, but it can evaluate a name, so outcomes and examples read back as plain values. `sealed` is set once a
// solver has taken `domain`: naming a formula after that would leave the name undefined.
export type QCase = SymCase & { q: Record<string, Items>; named: Map<string, B>; sealed?: boolean };
// Inside "some", the item being looked at is a bound variable.
type At = { list: string; i: number; x?: X } | null;

const SUMMED_SLOTS = 3;   // when a caller gives no number

const summed = (spec: Spec, key: string) => JSON.stringify([spec.rules, spec.collections, spec.computed]).includes(`"sum_over":${JSON.stringify(key)}`);

let fresh = 0;

export class QuantEncoder extends Encoder {
  readonly sorts: Record<string, Sort> = {};
  readonly budgetMs: number;   // how long one question may take (see Options.budgetMs in core/sop-checks.ts)
  // Names are per encoder: two versions of a spec read one case, and the same condition can mean different things
  // in each (a named value list, or who counts, may differ).
  readonly id = fresh++;
  // `versions`: every spec read with this one (a diff reads two); a list added up in any of them keeps its slots.
  constructor(ctx: Ctx, spec: Spec, slots = SUMMED_SLOTS, dom: Record<string, Domain> = domains(spec), budgetMs = 20_000, versions: Spec[] = [spec]) {
    super(ctx, spec, slots, dom);
    this.budgetMs = budgetMs;
    for (const c of spec.collections) if (!versions.some((v) => summed(v, c.key))) this.sorts[c.key] = ctx.Sort.declare(c.key);
  }

  quantified(list: string) { return list in this.sorts; }

  override symCase(tag: string): QCase {
    const s = super.symCase(tag) as QCase;
    const { ctx } = this, { Bool, Int, Real, And, Implies, ForAll, Exists } = ctx;
    s.q = {};
    s.named = new Map();
    for (const [list, sort] of Object.entries(this.sorts)) {
      s.items[list] = [];        // no slots: the code that walks slots skips this list
      const fn = (name: string, range: Parameters<Ctx["Function"]["declare"]>[2]) => ctx.Function.declare(`${name}_${tag}`, sort, range);
      const own = this.spec.facts.filter((f) => f.per === list);
      const items: Items = {
        present: fn(`${list}_has`, Bool.sort()),
        facts: Object.fromEntries(own.filter((f) => !f.numeric).map((f) => [f.key, fn(f.key, Int.sort())])),
        numeric: Object.fromEntries(own.filter((f) => f.numeric).map((f) => [f.key, { known: fn(`${f.key}_known`, Bool.sort()), value: fn(f.key, Real.sort()) }])),
        first: ctx.Const(`${list}_first`, sort),
        any: Bool.const(`${list}_any_${tag}`),
      };
      s.q[list] = items;
      const x = ctx.Const(`d_${list}`, sort);
      const inRange = Object.entries(items.facts).map(([k, f]) => { const v = f.call(x) as I; return And(v.ge(0), v.le(this.unk(k))); });
      if (inRange.length) s.domain.push(ForAll([x], Implies(items.present.call(x) as B, And(...inRange))));
      // A list with items is given.
      s.domain.push(items.any.eq(Exists([x], items.present.call(x) as B)), Implies(items.any, s.listed[list]));
    }
    return s;
  }

  // Whether the case gives the list any items at all (core/slice.ts splits on this).
  override anyItem(s: SymCase, list: string): B {
    if (!this.quantified(list)) return super.anyItem(s, list);
    return (s as QCase).q[list].any;
  }

  // A name for a quantified formula, defined once per copy of the case.
  name(s: SymCase, key: string, make: () => B): B {
    const q = s as QCase;
    key = `${this.id} ${key}`;
    let b = q.named.get(key);
    if (!b) {
      if (q.sealed) throw new Error("A quantified condition was encoded after the solver took the case's constraints.");
      b = this.ctx.Bool.const(`q${q.named.size}_${q.tag}`);
      q.domain.push(b.eq(make()));
      q.named.set(key, b);
    }
    return b;
  }

  override cond(c: Condition, s: SymCase, at: At = null): { y: B; n: B } {
    const { And, Or, Not, Implies, Exists, ForAll, Bool } = this.ctx;
    if ("some" in c && this.quantified(c.some)) {
      const q = (s as QCase).q[c.some], x = this.ctx.Const(`x${fresh++}_${c.some}`, this.sorts[c.some]), key = JSON.stringify(c);
      const here = { list: c.some, i: -1, x }, has = q.present.call(x) as B;
      const m = this.countsAt(c.some, s, here), w = this.cond(c.where, s, here);
      const okWhen = this.spec.collections.find((k) => k.key === c.some)?.empty_ok_when;
      const emptyOk = okWhen ? this.cond(okWhen, s).y : Bool.val(false);
      return {
        y: this.name(s, `y ${key}`, () => Exists([x], And(has, m.y, w.y))),
        // As in the evaluator: "no item" holds only if no item is a match, and some item certainly counts (or an
        // empty list is fine here).
        n: And(this.name(s, `n ${key}`, () => ForAll([x], Implies(has, Or(m.n, w.n)))),
               Or(this.name(s, `counts ${c.some}`, () => Exists([x], And(has, m.y))), emptyOk)),
      };
    }
    if ("fact" in c && at?.x && !("at_least" in c) && !this.numFact(c.fact, s, at)) {
      const f = (s as QCase).q[at.list].facts[c.fact];
      if (f) {
        const v = f.call(at.x) as I, unk = v.eq(this.unk(c.fact));
        if ("is_unknown" in c) return { y: unk, n: Not(unk) };
        const vals = "is" in c ? [c.is] : typeof c.in === "string" ? this.spec.lists[c.in] : c.in;
        const yes = this.isOneOf(c.fact, vals, v);
        return { y: yes, n: And(Not(yes), Not(unk)) };
      }
    }
    return super.cond(c, s, at as never);
  }

  countsAt(list: string, s: SymCase, at: At): { y: B; n: B } {
    const when = this.spec.collections.find((x) => x.key === list)?.counts_when;
    return when ? this.cond(when, s, at) : { y: this.ctx.Bool.val(true), n: this.ctx.Bool.val(false) };
  }

  override numFact(key: string, s: SymCase, at: At): Num | undefined {
    if (at?.x) {
      const n = (s as QCase).q[at.list]?.numeric[key];
      if (n) return { known: n.known.call(at.x) as B, value: n.value.call(at.x) as never };
      return s.numeric[key];
    }
    return super.numFact(key, s, at as never);
  }

  // The same items in both copies, every known value kept, and no unknowns left in the second.
  override completes(a: SymCase, b: SymCase): B[] {
    const { And, Or, Implies, ForAll } = this.ctx;
    const out = super.completes(a, b);
    for (const [list, sort] of Object.entries(this.sorts)) {
      const qa = (a as QCase).q[list], qb = (b as QCase).q[list], x = this.ctx.Const(`c_${list}`, sort);
      const same = Object.entries(qa.facts).map(([k, f]) => {
        const u = f.call(x) as I, v = qb.facts[k].call(x) as I;
        return And(Or(u.eq(this.unk(k)), v.eq(u)), v.neq(this.unk(k)));
      });
      const sameNum = Object.entries(qa.numeric).map(([k, n]) => {
        const m = qb.numeric[k];
        return And(m.known.call(x) as B, Implies(n.known.call(x) as B, (m.value.call(x) as never as Num["value"]).eq(n.value.call(x) as never)));
      });
      out.push(ForAll([x], And((qa.present.call(x) as B).eq(qb.present.call(x) as B), Implies(qa.present.call(x) as B, And(...same, ...sameNum)))));
    }
    return out;
  }

  // Two copies with the same items and facts, except `fact`, which may differ on one item (the list's `first`).
  override sameItemsExcept(a: SymCase, b: SymCase, fact: string): B[] {
    const { And, Implies, ForAll } = this.ctx;
    const out = super.sameItemsExcept(a, b, fact);
    for (const [list, sort] of Object.entries(this.sorts)) {
      const qa = (a as QCase).q[list], qb = (b as QCase).q[list], x = this.ctx.Const(`e_${list}`, sort);
      const other = x.neq(qa.first);
      const eq = [
        ...Object.entries(qa.facts).map(([k, f]) => { const e = (f.call(x) as I).eq(qb.facts[k].call(x) as I); return k === fact ? Implies(other, e) : e; }),
        ...Object.entries(qa.numeric).map(([k, n]) => {
          const m = qb.numeric[k];
          const e = And((n.known.call(x) as B).eq(m.known.call(x) as B), (n.value.call(x) as never as Num["value"]).eq(m.value.call(x) as never));
          return k === fact ? Implies(other, e) : e;
        }),
      ];
      // Both copies name the same `first` element: its constant has no copy tag.
      out.push(ForAll([x], And((qa.present.call(x) as B).eq(qb.present.call(x) as B), ...eq)));
    }
    return out;
  }

  // At most one item in each list, for a short example.
  override oneItemEach(s: SymCase): B[] {
    const { And, Implies, ForAll } = this.ctx;
    const out = super.oneItemEach(s);
    for (const [list, sort] of Object.entries(this.sorts)) {
      const p = (s as QCase).q[list].present, x = this.ctx.Const(`o1_${list}`, sort), y = this.ctx.Const(`o2_${list}`, sort);
      out.push(ForAll([x, y], Implies(And(p.call(x) as B, p.call(y) as B), x.eq(y))));
    }
    return out;
  }

  // For a short example: each of these says every item knows one fact. Each is kept if the example still holds.
  override itemsKnown(s: SymCase): B[] {
    const { Implies, ForAll } = this.ctx;
    const out = super.itemsKnown(s);
    for (const [list, sort] of Object.entries(this.sorts)) {
      const q = (s as QCase).q[list], x = this.ctx.Const(`k_${list}`, sort), has = q.present.call(x) as B;
      for (const [k, f] of Object.entries(q.facts)) out.push(ForAll([x], Implies(has, (f.call(x) as I).neq(this.unk(k)))));
      for (const n of Object.values(q.numeric)) out.push(ForAll([x], Implies(has, n.known.call(x) as B)));
    }
    return out;
  }

  // Pins the case's items to exactly as many elements as the case lists.
  override pin(s: SymCase, c: Case): B[] {
    const { ctx } = this, { And, Not, Or, Distinct, ForAll, Real } = ctx;
    const quant = Object.fromEntries(Object.keys(this.sorts).map((k) => [k, c.items[k]]));
    const out = super.pin(s, { ...c, items: Object.fromEntries(Object.entries(c.items).map(([k, v]) => [k, k in this.sorts ? (v == null ? null : []) : v])) });
    const n = (x: Num, v: unknown) => { const f = fromValue(v); return f ? And(x.known, x.value.eq(Real.val(`${f.n}/${f.d}`))) : Not(x.known); };
    for (const [list, items] of Object.entries(quant)) {
      const q = (s as QCase).q[list], sort = this.sorts[list], xs = (items ?? []).map((_, i) => ctx.Const(`pin${fresh++}_${i}`, sort));
      const x = ctx.Const(`p_${list}`, sort);
      out.push(ForAll([x], (q.present.call(x) as B).eq(xs.length ? Or(...xs.map((e) => x.eq(e))) : ctx.Bool.val(false))));
      if (xs.length > 1) out.push(Distinct(...xs));
      xs.forEach((e, i) => {
        for (const [k, f] of Object.entries(q.facts)) out.push((f.call(e) as I).eq(this.idx(k, readFact(this.spec, k, items![i][k]))));
        for (const [k, m] of Object.entries(q.numeric)) out.push(n({ known: m.known.call(e) as B, value: m.value.call(e) as never }, items![i][k]));
      });
    }
    return out;
  }

  override readCase(m: Parameters<Encoder["readCase"]>[0], s: SymCase) {
    const out = super.readCase(m, s);
    const mm = m as unknown as { eval(x: unknown, complete?: boolean): { toString(): string }; get(sort: Sort): { length(): number; get(i: number): X } };
    const val = (fact: string, x: unknown) => this.dom[fact].labels[Number(mm.eval(x, true).toString())];
    for (const [list, sort] of Object.entries(this.sorts)) {
      if (mm.eval(s.listed[list], true).toString() !== "true") { out.items[list] = null; continue; }
      const q = (s as QCase).q[list];
      let universe: X[] = [];
      try { const u = mm.get(sort); universe = [...Array(u.length()).keys()].map((i) => u.get(i)); } catch { universe = []; }
      out.items[list] = universe.filter((e) => mm.eval(q.present.call(e), true).toString() === "true").map((e) => ({
        ...Object.fromEntries(Object.entries(q.facts).map(([k, f]) => [k, val(k, f.call(e))])),
        ...Object.fromEntries(Object.entries(q.numeric).map(([k, n]) => [k, this.readNum(m, { known: n.known.call(e) as B, value: n.value.call(e) as never })])),
      }));
    }
    return out;
  }
}
