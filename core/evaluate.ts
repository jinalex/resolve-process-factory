// The evaluator: applies a spec to one case's facts and gives the outcome the spec requires.
// Every fact is one of its values or unknown, and a missing fact counts as unknown. Conditions use three-valued
// logic, so a rule can apply, not apply, or "might apply". A rule that might apply leads to the spec's unknowns
// outcome (in the KYB SOP, 2.2: incomplete), so an unknown is never read as a "no".
// Nothing here knows the domain. A domain pack turns its raw case into this shape and works out the computed facts.
import type { Condition, Outcome, Rule, Spec } from "./spec.ts";

type Tri = "yes" | "no" | "unknown";
export type Value = string | boolean | null | undefined;
export type Item = { name: string } & Record<string, Value>;

// One case as the rules see it: facts about the case as a whole, the items in each of its lists (people,
// expense lines), and the facts the domain's code computed. A missing or null list means nobody has listed them.
export type Case = {
  facts: Record<string, Value>;
  items: Record<string, Item[] | null | undefined>;
  computed: Record<string, Value | number>;
};

export type Hit = { rule: string; sop: string; text: string; then: Outcome; because?: string[] };
export type Result = {
  outcome: Outcome;
  decided_by: Hit[];         // the rules behind the outcome
  applied: Hit[];            // every rule that applies
  might_apply: Hit[];        // rules that apply under some value of an unknown fact
  notes: string[];           // plain sentences, e.g. a pending check that could still mean decline
};

// A value as written in a case file, read as a fact value. Missing, null and "unknown" are all unknown.
export function read(v: Value): string {
  if (v === true) return "yes";
  if (v === false) return "no";
  if (v === null || v === undefined || v === "" || v === "unknown") return "unknown";
  return v;
}

const and = (xs: Tri[]): Tri => (xs.includes("no") ? "no" : xs.includes("unknown") ? "unknown" : "yes");
const or = (xs: Tri[]): Tri => (xs.includes("yes") ? "yes" : xs.includes("unknown") ? "unknown" : "no");
const not = (x: Tri): Tri => (x === "yes" ? "no" : x === "no" ? "yes" : "unknown");
const words = (k: string) => k.replace(/_/g, " ");

export function evaluate(spec: Spec, c: Case): Result {
  const facts = new Map(spec.facts.map((f) => [f.key, f]));
  const collections = new Map(spec.collections.map((x) => [x.key, x]));

  // Evaluates a condition and collects the unknown facts it depended on, so a note can name them.
  let unknownsSeen: string[] = [];
  const ev = (cond: Condition, item: Item | null): Tri => {
    if ("all" in cond) return and(cond.all.map((x) => ev(x, item)));
    if ("any" in cond) return or(cond.any.map((x) => ev(x, item)));
    if ("not" in cond) return not(ev(cond.not, item));
    if ("some" in cond) {
      const items = c.items[cond.some] ?? [];
      if (items.length === 0) {
        // With no items, "some item" is unknown, unless the spec says an empty list is fine here.
        const okWhen = collections.get(cond.some)?.empty_ok_when;
        const seen = unknownsSeen;
        unknownsSeen = [];
        const ok = okWhen ? ev(okWhen, null) : "no";
        unknownsSeen = seen;
        if (ok === "yes") return "no";
        unknownsSeen.push(collections.get(cond.some)?.unknown_when_empty ?? `which ${words(cond.some)} there are`);
        return "unknown";
      }
      return or(items.map((x) => ev(cond.where, x)));
    }
    if ("fact" in cond) {
      const per = facts.get(cond.fact)?.per, own = per !== undefined && per !== "case";
      const v = read(own && item ? item[cond.fact] : c.facts[cond.fact]);
      if ("is_unknown" in cond) return v === "unknown" ? "yes" : "no";
      if (v === "unknown") { unknownsSeen.push(own && item ? `${words(cond.fact)} for ${item.name}` : words(cond.fact)); return "unknown"; }
      if ("is" in cond) return v === cond.is ? "yes" : "no";
      const list = typeof cond.in === "string" ? spec.lists[cond.in] : cond.in;
      return list.includes(v) ? "yes" : "no";
    }
    const v = c.computed[cond.computed];
    if ("at_least" in cond) {
      if (typeof v !== "number") { unknownsSeen.push(words(cond.computed)); return "unknown"; }
      return v >= cond.at_least ? "yes" : "no";
    }
    const t = read(v as Value);
    if (t === "unknown") { unknownsSeen.push(words(cond.computed)); return "unknown"; }
    return t === cond.is ? "yes" : "no";
  };

  const hit = (r: Rule, because?: string[]): Hit => ({ rule: r.id, sop: r.sop, text: r.text, then: r.then, ...(because?.length ? { because } : {}) });
  const applied: Hit[] = [], might_apply: Hit[] = [];
  for (const r of spec.rules) {
    unknownsSeen = [];
    const v = ev(r.when, null);
    if (v === "yes") applied.push(hit(r));
    else if (v === "unknown") might_apply.push(hit(r, [...new Set(unknownsSeen)]));
  }

  // The most severe outcome governs (the spec's order). A rule that might apply counts as the unknowns outcome.
  const candidates: { then: Outcome; hit: Hit }[] = [
    ...applied.map((h) => ({ then: h.then, hit: h })),
    ...might_apply.map((h) => ({ then: spec.unknowns.then, hit: h })),
  ];
  const rank = (o: Outcome) => spec.order.indexOf(o);
  const best = candidates.reduce<Outcome>((o, x) => (rank(x.then) < rank(o) ? x.then : o), spec.order[spec.order.length - 1]);
  const decided_by = candidates.filter((x) => x.then === best).map((x) => x.hit);

  // A rule more severe than the outcome that might still apply is worth knowing, e.g. a pending sanctions check.
  const notes = might_apply.filter((h) => rank(h.then) < rank(best)).map((h) =>
    `${h.sop} could still apply once ${h.because?.join(" and ") ?? "an unknown fact"} is known, and would mean ${words(h.then)}.`);

  return { outcome: best, decided_by, applied, might_apply, notes };
}
