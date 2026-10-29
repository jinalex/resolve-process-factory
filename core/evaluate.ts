// The evaluator: applies a spec to one case's facts and gives the outcome the spec requires.
// Every fact is one of its values or unknown, and a missing fact counts as unknown. Conditions use three-valued
// logic, so a rule can apply, not apply, or "might apply". A rule that might apply leads to the spec's unknowns
// outcome (in the KYB SOP, 2.2: incomplete), so an unknown is never read as a "no".
// Nothing here knows the domain. A domain pack turns its raw case into this shape and works out the computed facts.
import { type Frac, ZERO, add, cmp, fromNumber, fromValue } from "./frac.ts";
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

// A value as written in a case file, read as a fact value. Missing, null, blank and "unknown" in any case are all
// unknown, whatever the fact: " Unknown " must never read as a country code.
export function read(v: Value): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  const s = v === null || v === undefined ? "" : String(v);
  return ["", "unknown"].includes(s.trim().toLowerCase()) ? "unknown" : s;
}

// A computed fact's word, read like a fact with declared values: "YES" is yes.
export const readComputed = (v: Value) => read(v).trim().toLowerCase();

// A fact's value as the spec reads it. Case and surrounding spaces don't matter: the case's word goes through the
// spec's word map first ("Virtual currency" is crypto), and otherwise is one of the fact's values ("Gift" is gift).
// A fact that takes any value, like a country code, keeps the word as written.
export function readFact(spec: Spec, key: string, v: Value): string {
  const value = read(v), word = value.trim().toLowerCase();
  const mapped = spec.maps?.[key]?.[word];
  if (mapped !== undefined) return mapped;
  return spec.facts.find((f) => f.key === key)?.values?.length ? word : value;
}

// A number as written in a case file, kept exact. Anything else is unknown.
const num = (v: Value) => fromValue(v);

// A condition's value, and when it's unknown, the unknown facts it depends on (so a note can name them).
type Answer = { value: Tri; unknowns: string[] };
const known = (yes: boolean): Answer => ({ value: yes ? "yes" : "no", unknowns: [] });
const unknown = (what: string): Answer => ({ value: "unknown", unknowns: [what] });

// Kleene logic: "and" is no if any part is no, "or" is yes if any part is yes; otherwise an unknown part decides.
function combine(parts: Answer[], decisive: Tri): Answer {
  if (parts.some((p) => p.value === decisive)) return { value: decisive, unknowns: [] };
  const open = parts.filter((p) => p.value === "unknown");
  if (open.length === 0) return { value: decisive === "no" ? "yes" : "no", unknowns: [] };
  return { value: "unknown", unknowns: open.flatMap((p) => p.unknowns) };
}
const flip = (a: Answer): Answer => (a.value === "unknown" ? a : known(a.value === "no"));

const words = (k: string) => k.replace(/_/g, " ");

export function evaluate(spec: Spec, c: Case): Result {
  const facts = new Map(spec.facts.map((f) => [f.key, f]));
  const collections = new Map(spec.collections.map((x) => [x.key, x]));
  const computed = new Map(spec.computed.map((x) => [x.key, x]));

  // "Some item in the list" is yes if any item matches. With no items it is unknown,
  // unless the spec says an empty list is fine here (KYB: an excluded entity needs no individuals).
  // An item the SOP's rules are about: the list's `counts_when` holds for it, or might.
  const counts = (list: string, item: Item): Answer => {
    const when = collections.get(list)?.counts_when;
    return when ? ev(when, item) : known(true);
  };
  const some = (list: string, where: Condition): Answer => {
    // "No" needs an item that certainly counts, or an empty list the spec allows. Otherwise, with nobody
    // certainly counting, the list might be empty, and an empty list is unknown: filling in whether someone
    // counts must never turn an approval into incomplete.
    const items = c.items[list] ?? [];
    const hit = combine(items.map((item) => combine([counts(list, item), ev(where, item)], "no")), "yes");
    if (hit.value === "yes" || items.some((item) => counts(list, item).value === "yes")) return hit;
    const col = collections.get(list);
    if (col?.empty_ok_when && ev(col.empty_ok_when, null).value === "yes") return hit;
    return unknown(col?.unknown_when_empty ?? `which ${words(list)} there are`);
  };

  // A fact of the whole case, or of the item being looked at inside "some". A value the spec doesn't
  // declare (a typo, "maybe") is unknown: it must never quietly count as "doesn't match".
  const fact = (key: string, item: Item | null): { value: string; label: string; n?: Frac | null } => {
    const decl = facts.get(key);
    const perItem = decl?.per !== "case" && item !== null;
    const label = perItem ? `${words(key)} for ${item.name}` : words(key);
    const raw = perItem ? item[key] : c.facts[key];
    if (decl?.numeric) return { value: num(raw) === null ? "unknown" : "number", label, n: num(raw) };
    const value = readFact(spec, key, raw);
    if (value !== "unknown" && decl?.values?.length && !decl.values.includes(value)) {
      return { value: "unknown", label: `${label} (unrecognised value "${value}")` };
    }
    return { value, label };
  };

  // A number in a condition, kept exact so a sum lands on a threshold the way Z3 sees it, or null with the
  // unknown facts it depends on.
  type Num = { n: Frac | null; unknowns: string[] };
  const exact = (v: Frac | null | undefined, label: string): Num => (v == null ? { n: null, unknowns: [label] } : { n: v, unknowns: [] });
  const total = (parts: Num[]): Num => parts.some((p) => p.n === null)
    ? { n: null, unknowns: parts.flatMap((p) => p.unknowns) } : { n: parts.reduce((a, p) => add(a, p.n!), ZERO), unknowns: [] };
  const term = (t: Term, item: Item | null): Num => {
    if ("sum_over" in t) {
      // A list the case doesn't give at all adds up to unknown, never 0, unless the spec says an empty list is fine
      // here, which is how "some" reads it too. A list given empty adds up to 0.
      const items = c.items[t.sum_over], col = collections.get(t.sum_over);
      if (items == null && !(col?.empty_ok_when && ev(col.empty_ok_when, null).value === "yes")) {
        return { n: null, unknowns: [col?.unknown_when_empty ?? `which ${words(t.sum_over)} there are`] };
      }
      return total((items ?? []).map((x) => {
        const inc = combine([counts(t.sum_over, x), t.where ? ev(t.where, x) : known(true)], "no");
        if (inc.value === "no") return { n: ZERO, unknowns: [] };
        if (inc.value === "unknown") return { n: null, unknowns: inc.unknowns };
        const f = fact(t.of, x);
        return exact(f.n, f.label);
      }));
    }
    if ("fact" in t) { const f = fact(t.fact, item); return exact(f.n, f.label); }
    const def = computed.get(t.computed)?.sum;
    if (def) return total(def.map((x) => term(x, null)));
    return exact(num(c.computed[t.computed]), words(t.computed));
  };
  const atLeast = (x: Num, bar: number): Answer =>
    (x.n === null ? { value: "unknown", unknowns: x.unknowns } : known(cmp(x.n, fromNumber(bar)) >= 0));

  const ev = (cond: Condition, item: Item | null): Answer => {
    if ("all" in cond) return combine(cond.all.map((x) => ev(x, item)), "no");
    if ("any" in cond) return combine(cond.any.map((x) => ev(x, item)), "yes");
    if ("not" in cond) return flip(ev(cond.not, item));
    if ("some" in cond) return some(cond.some, cond.where);
    if ("sum" in cond) return atLeast(total(cond.sum.map((t) => term(t, item))), cond.at_least);
    if ("fact" in cond && "at_least" in cond) return atLeast(term({ fact: cond.fact }, item), cond.at_least);
    if ("fact" in cond) {
      const f = fact(cond.fact, item);
      if ("is_unknown" in cond) return known(f.value === "unknown");
      if (f.value === "unknown") return unknown(f.label);
      if ("is" in cond) return known(f.value === cond.is);
      const list = typeof cond.in === "string" ? spec.lists[cond.in] : cond.in;
      return known(list.includes(f.value));
    }
    if ("at_least" in cond) return atLeast(term({ computed: cond.computed }, null), cond.at_least);
    // As for facts, a value the spec doesn't declare is unknown, not a quiet "doesn't match".
    const t = readComputed(c.computed[cond.computed]), values = computed.get(cond.computed)?.values ?? ["yes", "no"];
    if (t !== "unknown" && !values.includes(t)) return unknown(`${words(cond.computed)} (unrecognised value "${t}")`);
    return t === "unknown" ? unknown(words(cond.computed)) : known(t === cond.is);
  };

  const hit = (r: Rule, because: string[] = []): Hit =>
    ({ rule: r.id, sop: r.sop, text: r.text, then: r.then, ...(because.length ? { because } : {}) });
  const applied: Hit[] = [], might_apply: Hit[] = [];
  for (const r of spec.rules) {
    const a = ev(r.when, null);
    if (a.value === "yes") applied.push(hit(r));
    else if (a.value === "unknown") might_apply.push(hit(r, [...new Set(a.unknowns)]));
  }

  // The most severe outcome governs (the spec's order). A rule that might apply counts as the unknowns outcome.
  const candidates: { then: Outcome; hit: Hit }[] = [
    ...applied.map((h) => ({ then: h.then, hit: h })),
    ...might_apply.map((h) => ({ then: spec.unknowns.then, hit: h })),
  ];
  const rank = (o: Outcome) => spec.order.indexOf(o);
  const lowest = spec.order[spec.order.length - 1];
  const best = candidates.reduce<Outcome>((o, x) => (rank(x.then) < rank(o) ? x.then : o), lowest);
  const decided_by = candidates.filter((x) => x.then === best).map((x) => x.hit);

  // A rule more severe than the outcome that might still apply is worth knowing, e.g. a pending sanctions check.
  const notes = might_apply.filter((h) => rank(h.then) < rank(best)).map((h) => {
    const what = h.because?.join(" and ") ?? "an unknown fact";
    return `${h.sop} could still apply once ${what} is known, and would mean ${words(h.then)}.`;
  });

  const counted = Object.fromEntries(spec.collections.filter((x) => x.counts_when).map((x) =>
    [x.key, Object.fromEntries((c.items[x.key] ?? []).map((item) => [item.name, counts(x.key, item).value]))]));
  const sums = Object.fromEntries(spec.computed.filter((x) => x.sum).map((x) => {
    const v = term({ computed: x.key }, null).n;
    return [x.key, v === null ? null : Number(v.n) / Number(v.d)];
  }));
  return { outcome: best, decided_by, applied, might_apply, notes, counts: counted, sums };
}
