// The evaluator: applies a spec to one case's facts and gives the outcome the spec requires.
// Every fact is one of its values or unknown, and a missing fact counts as unknown. Conditions use three-valued
// logic, so a rule can apply, not apply, or "might apply". A rule that might apply leads to the spec's unknowns
// outcome (in the KYB SOP, 2.2: incomplete), so an unknown is never read as a "no".
// Nothing here knows the domain. A domain pack turns its raw case into this shape and works out the computed facts.
//
// The decisions are made by the Dafny evaluator in dafny/evaluate.dfy, compiled to dafny/evaluate.cjs, where two
// facts about it are proved for every spec and case: it never approves on an unknown, and filling in an unknown
// never undoes an answer. This file only turns a spec and a case into Dafny values, reads each value the way the
// rules read it, and turns the answer back into a Result with plain-English notes.
import compiled from "./dafny/evaluate.cjs";
import { type Frac, frac, fromNumber, fromValue } from "./frac.ts";
import type { Condition, Outcome, Rule, Spec, Term } from "./spec.ts";

type Tri = "yes" | "no" | "unknown";
export type Value = string | number | boolean | null | undefined;
export type Item = { name: string } & Record<string, Value>;

// One case as the rules see it: facts about the case as a whole, the items in each of its lists (people,
// expense lines), and the facts the domain's code computed. A missing or null list means nobody has listed them.
export type Case = {
  facts: Record<string, Value>;
  items: Record<string, Item[] | null | undefined>;
  computed: Record<string, Value>;
};

export type Hit = { rule: string; sop: string; text: string; then: Outcome; because?: string[] };
export type Result = {
  outcome: Outcome;
  decided_by: Hit[];         // the rules behind the outcome
  applied: Hit[];            // every rule that applies
  might_apply: Hit[];        // rules that apply under some value of an unknown fact
  notes: string[];           // plain sentences, e.g. a pending check that could still mean decline
  counts: Record<string, Record<string, Tri>>; // for a list with `counts_when`: whether each item counts, by name
  sums: Record<string, number | null>;          // each computed fact the spec adds up itself; null if unknown
};

// A value as written in a case file, read as a fact value. Missing, null and "unknown" are all unknown.
export function read(v: Value): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  if (v === null || v === undefined || v === "" || v === "unknown") return "unknown";
  return String(v);
}

// A fact's value as the spec reads it. Case and surrounding spaces don't matter: the case's word goes through the
// spec's word map first ("Virtual currency" is crypto), and otherwise is one of the fact's values ("Gift" is gift).
// A fact that takes any value, like a country code, keeps the word as written. (The Dafny evaluator does the same.)
export function readFact(spec: Spec, key: string, v: Value): string {
  const value = read(v), word = value.trim().toLowerCase();
  const mapped = spec.maps?.[key]?.[word];
  if (mapped !== undefined) return mapped;
  return spec.facts.find((f) => f.key === key)?.values?.length ? word : value;
}

// ---- Into Dafny values.
const { _dafny, Resolve: D, BigNumber } = compiled;
// Dafny strings are compiled as JavaScript strings (UTF-16, --unicode-char:false), or as a list of characters when
// Dafny built the string itself.
const str = (s: string) => s;
const unstr = (s: any): string => (typeof s === "string" ? s : s.join(""));
const seq = <T>(xs: T[], f: (x: T) => unknown) => _dafny.Seq.of(...xs.map(f));
const none = () => D.Option.create_None();
const some = (v: unknown) => D.Option.create_Some(v);
const opt = <T>(v: T | undefined | null, f: (x: T) => unknown) => (v == null ? none() : some(f(v)));
const real = (x: Frac) => new _dafny.BigRational(new BigNumber(x.n.toString()), new BigNumber(x.d.toString()));
const unreal = (r: any): Frac => frac(BigInt(r.num.toFixed()), BigInt(r.den.toFixed()));
const dmap = <T>(entries: [string, T][], f: (x: T) => unknown) =>
  entries.reduce((m, [k, v]) => m.update(str(k), f(v)), _dafny.Map.Empty);

// A value is read here exactly as the rules read it: its text, that text trimmed and lower-cased, and its number.
const raw = (v: Value) => {
  const text = read(v), n = fromValue(v);
  return D.Raw.create_Raw(str(text), str(text.trim().toLowerCase()), n === null ? none() : some(real(n)));
};

function condition(spec: Spec, c: Condition): unknown {
  if ("all" in c) return D.Condition.create_All(seq(c.all, (x) => condition(spec, x)));
  if ("any" in c) return D.Condition.create_Any(seq(c.any, (x) => condition(spec, x)));
  if ("not" in c) return D.Condition.create_Not(condition(spec, c.not));
  if ("some" in c) return D.Condition.create_SomeItem(str(c.some), condition(spec, c.where));
  if ("sum" in c) return D.Condition.create_SumAtLeast(seq(c.sum, (t) => term(spec, t)), real(fromNumber(c.at_least)));
  if ("fact" in c && "at_least" in c) return D.Condition.create_FactAtLeast(str(c.fact), real(fromNumber(c.at_least)));
  if ("fact" in c) {
    if ("is_unknown" in c) return D.Condition.create_FactIsUnknown(str(c.fact));
    if ("is" in c) return D.Condition.create_FactIs(str(c.fact), str(c.is));
    const list = typeof c.in === "string" ? spec.lists[c.in] : c.in;
    if (!list) throw new Error(`The value list ${c.in} isn't declared.`);
    return D.Condition.create_FactIn(str(c.fact), seq(list, str));
  }
  if ("at_least" in c) return D.Condition.create_ComputedAtLeast(str(c.computed), real(fromNumber(c.at_least)));
  return D.Condition.create_ComputedIs(str(c.computed), str(c.is));
}

function term(spec: Spec, t: Term): unknown {
  if ("sum_over" in t) return D.Term.create_TSumOver(str(t.sum_over), str(t.of), opt(t.where, (w) => condition(spec, w)));
  if ("fact" in t) return D.Term.create_TFact(str(t.fact));
  return D.Term.create_TComputed(str(t.computed));
}

// Converting a spec takes longer than evaluating one case, and callers evaluate many cases against one spec.
const converted = new WeakMap<Spec, unknown>();
function toDafny(spec: Spec): unknown {
  const cached = converted.get(spec);
  if (cached) return cached;
  // Declarations go in by key. A key declared twice has no one meaning, so it is refused (validateSpec says so too).
  const byKey = <T extends { key: string }>(what: string, xs: T[], f: (x: T) => unknown) => {
    const keys = xs.map((x) => x.key);
    const twice = keys.find((k, i) => keys.indexOf(k) !== i);
    if (twice !== undefined) throw new Error(`Two ${what} share the name ${twice}.`);
    return dmap(xs.map((x) => [x.key, x] as [string, T]), f);
  };
  const sp = D.Spec.create_Spec(
    seq(spec.order, str), str(spec.unknowns.then),
    byKey("facts", spec.facts, (f) => D.FactDecl.create_FactDecl(str(f.key), str(f.per), seq(f.values ?? [], str), !!f.numeric)),
    byKey("lists", spec.collections, (x) => D.Collection.create_Collection(str(x.key), opt(x.empty_ok_when, (w) => condition(spec, w)),
      opt(x.unknown_when_empty, str), opt(x.counts_when, (w) => condition(spec, w)))),
    byKey("computed facts", spec.computed, (x) => D.ComputedDecl.create_ComputedDecl(str(x.key), opt(x.values, (vs) => seq(vs, str)), !!x.numeric,
      opt(x.sum, (ts) => seq(ts, (t) => term(spec, t))))),
    seq(spec.collections.map((x) => x.key), str), seq(spec.computed.map((x) => x.key), str),
    dmap(Object.entries(spec.maps ?? {}), (words) => dmap(Object.entries(words), str)),
    seq(spec.rules, (r) => D.Rule.create_Rule(str(r.id), str(r.then), condition(spec, r.when))));
  converted.set(spec, sp);
  return sp;
}

function toCase(c: Case): unknown {
  const items = Object.entries(c.items).filter((e): e is [string, Item[]] => e[1] != null);
  return D.Case.create_Case(
    dmap(Object.entries(c.facts), raw),
    dmap(items, (xs) => seq(xs, (x) => D.Item.create_Item(str(String(x.name)), dmap(Object.entries(x), raw)))),
    dmap(Object.entries(c.computed), raw));
}

const tri = (t: any): Tri => (t.is_Yes ? "yes" : t.is_No ? "no" : "unknown");
const index = (n: any) => n.toNumber() as number;
const words = (k: string) => k.replace(/_/g, " ");

export function evaluate(spec: Spec, c: Case): Result {
  const r = D.__default.Evaluate(toDafny(spec), toCase(c));

  const hit = (rule: Rule, because: string[] = []): Hit =>
    ({ rule: rule.id, sop: rule.sop, text: rule.text, then: rule.then, ...(because.length ? { because } : {}) });
  const applied: Hit[] = [...r.dtor_applied].map((i: any) => hit(spec.rules[index(i)]));
  const because = [...r.dtor_because].map((us: any) => [...new Set<string>([...us].map(unstr))]);
  const mightIdx: number[] = [...r.dtor_mightApply].map(index);
  const might_apply: Hit[] = mightIdx.map((i, k) => hit(spec.rules[i], because[k]));
  const byRule = new Map<number, Hit>([...r.dtor_applied].map((i: any, k: number) => [index(i), applied[k]] as [number, Hit]));
  mightIdx.forEach((i, k) => byRule.set(i, might_apply[k]));
  const best: Outcome = unstr(r.dtor_outcome);
  const decided_by = [...r.dtor_decidedBy].map((i: any) => byRule.get(index(i))!);

  // A rule more severe than the outcome that might still apply is worth knowing, e.g. a pending sanctions check.
  const rank = (o: Outcome) => spec.order.indexOf(o);
  const notes = might_apply.filter((h) => rank(h.then) < rank(best)).map((h) => {
    const what = h.because?.join(" and ") ?? "an unknown fact";
    return `${h.sop} could still apply once ${what} is known, and would mean ${words(h.then)}.`;
  });

  const countLists = spec.collections.filter((x) => x.counts_when);
  const counts = Object.fromEntries(countLists.map((x, k) => {
    const tris = [...r.dtor_counts[k]].map(tri);
    return [x.key, Object.fromEntries((c.items[x.key] ?? []).map((item, i) => [item.name, tris[i]]))];
  }));
  const sumDecls = spec.computed.filter((x) => x.sum);
  const sums = Object.fromEntries(sumDecls.map((x, k) => {
    const v = r.dtor_sums[k];
    if (v.is_None) return [x.key, null];
    const f = unreal(v.dtor_v);
    return [x.key, Number(f.n) / Number(f.d)];
  }));
  return { outcome: best, decided_by, applied, might_apply, notes, counts, sums };
}
