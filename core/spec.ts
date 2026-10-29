// The rule format. Rules are data: a condition on named facts and the outcome it leads to.
// Claude drafts specs in this format (drafting/), Z3 checks them, and the evaluator runs them.
// Nothing here knows about KYB: a spec names its own outcomes, facts and lists of items (people,
// expense lines, transactions). A condition can only use the building blocks below; anything else
// is a finding for a person.

export type Outcome = string;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { some: string; where: Condition }                             // some item in a list, e.g. some parcel
  | { fact: string; is: string }                                   // unknown value -> unknown
  | { fact: string; in: string[] | string }                        // a literal list, or a named list in `lists`
  | { fact: string; is_unknown: true }                             // is this fact unknown? always yes or no
  | { fact: string; at_least: number }                            // a numeric fact, e.g. a parcel's weight
  | { computed: string; is: string }
  | { computed: string; at_least: number }
  | { sum: Term[]; at_least: number };                             // unknown if any part is unknown

// A number a condition can add up: a numeric fact (of the case, or of the item inside "some"), a numeric
// computed fact, or a fact added up over the items of a list where a condition holds (an empty list adds up to 0;
// a list the case doesn't give at all, to unknown unless an empty list is fine there).
export type Term = { fact: string } | { computed: string } | { sum_over: string; of: string; where?: Condition };

export type Rule = {
  id: string;          // stable across versions; answers and findings point at it
  sop: string;         // the SOP section, e.g. "3.3"
  text: string;        // the SOP sentence it came from
  when: Condition;
  then: Outcome;
};

// A fact belongs to the case as a whole, or to each item of one of the case's lists. It takes one of its
// values (none listed: any value, like a country code), or is a number.
export type FactDecl = { key: string; per: "case" | string; values?: string[]; numeric?: boolean };

// A list of items the SOP talks about. With no items, "some item" is unknown, unless `empty_ok_when` holds,
// e.g. a cancelled order needs no parcels. `unknown_when_empty` names what's unknown then, for notes ("which
// parcels the order has"). `counts_when` says which items the SOP's rules are about, e.g. the parcels still to
// ship out of every parcel the case names: "some item" looks only at items where it holds (or might hold), and
// a list where it certainly holds for none counts as empty. `sop` names where that comes from.
export type Collection = { key: string; item: string; empty_ok_when?: Condition; unknown_when_empty?: string;
                           counts_when?: Condition; sop?: string; text?: string };

// A fact the domain's own code works out from the raw case, e.g. an order's age in days. With `sum`, the spec
// works it out itself from other numbers, so the decision stays where Z3 and a person can see it.
export type ComputedDecl = { key: string; values?: string[]; numeric?: boolean; sum?: Term[]; sop?: string; text?: string };

export type Spec = {
  domain: string;                      // which pack computes this spec's computed facts
  version: number;
  sop: { file: string; revision: string };
  order: Outcome[];                    // most severe first; the first outcome with a rule that applies wins
  order_sop: string;                   // the SOP section that sets the order, e.g. "2.1"
  unknowns: { sop: string; text: string; then: Outcome }; // what a rule that might apply leads to
  facts: FactDecl[];
  collections: Collection[];
  computed: ComputedDecl[];
  lists: Record<string, string[]>;
  list_sources?: Record<string, string>; // where an outside list comes from, and its date, e.g. a published list and its date
  maps?: Record<string, Record<string, string>>; // the words a case may use for a fact's value, e.g. "next day" -> express
  rules: Rule[];
};

// Problems that make a spec unusable, in plain sentences. An empty list means the spec is well formed.
export function validateSpec(spec: Spec): string[] {
  const problems: string[] = [];
  const say = (text: string) => void problems.push(text);
  const facts = new Map(spec.facts.map((f) => [f.key, f]));
  const computed = new Map(spec.computed.map((c) => [c.key, c]));
  const collections = new Map(spec.collections.map((c) => [c.key, c]));

  if (!spec.order.length || new Set(spec.order).size !== spec.order.length) say("The order must rank each outcome exactly once.");
  if (!spec.order.includes(spec.unknowns.then)) say(`The unknowns rule leads to "${spec.unknowns.then}", which isn't in the order.`);
  if (facts.size !== spec.facts.length) say("Two facts share a name.");
  if (computed.size !== spec.computed.length) say("Two computed facts share a name.");
  if (collections.size !== spec.collections.length) say("Two lists share a name.");
  for (const k of computed.keys()) if (facts.has(k)) say(`${k} is both a fact and a computed fact.`);
  for (const f of spec.facts) {
    if (f.per !== "case" && !collections.has(f.per)) say(`The fact ${f.key} belongs to a list that isn't declared: ${f.per}.`);
  }

  // A fact is used where it lives (an item's fact only inside "some" of its list; a case fact anywhere) and with
  // its own values.
  const where = (key: string, r: string, scope: string) => {
    const f = facts.get(key);
    if (!f) return void say(`${r} uses a fact that isn't declared: ${key}.`);
    if (f.per !== scope && f.per !== "case") say(`${r} uses ${key}, which belongs to each item of ${f.per}, outside "some ${f.per}".`);
    return f;
  };
  const checkFact = (c: Extract<Condition, { fact: string }>, r: string, scope: string) => {
    const f = where(c.fact, r, scope);
    if (!f) return;
    if ("at_least" in c) return void (!f.numeric && say(`${r} compares ${c.fact} with a number, but it isn't numeric.`));
    if (f.numeric && !("is_unknown" in c)) return say(`${r} compares the number ${c.fact} with a value.`);
    if ("in" in c && typeof c.in === "string") {
      if (!spec.lists[c.in]) say(`${r} uses a value list that isn't declared: ${c.in}.`);
      return;
    }
    const compared = "is" in c ? [c.is] : "in" in c ? c.in : [];
    for (const v of compared) {
      if (f.values?.length && !f.values.includes(v)) say(`${r} compares ${c.fact} with "${v}", which isn't one of its values.`);
    }
  };

  const checkComputed = (c: Extract<Condition, { computed: string }>, r: string) => {
    const k = computed.get(c.computed);
    if (!k) return say(`${r} uses a computed fact that isn't declared: ${c.computed}.`);
    if ("at_least" in c && !k.numeric) say(`${r} compares ${c.computed} with a number, but it isn't numeric.`);
    if ("is" in c && k.numeric) say(`${r} compares the number ${c.computed} with a value.`);
    if ("is" in c && !k.numeric && !(k.values ?? ["yes", "no"]).includes(c.is)) {
      say(`${r} compares ${c.computed} with "${c.is}", which isn't one of its values.`);
    }
  };

  // Every part of a sum is a number that can be read where the sum is.
  const checkTerms = (terms: Term[], r: string, scope: string, negated: boolean) => {
    for (const t of terms) {
      if ("sum_over" in t) {
        if (!collections.has(t.sum_over)) say(`${r} adds up over a list that isn't declared: ${t.sum_over}.`);
        if (scope !== "case") say(`${r} adds up over ${t.sum_over} inside "some ${scope}".`);
        const f = where(t.of, r, t.sum_over);
        if (f && !f.numeric) say(`${r} adds up ${t.of}, which isn't numeric.`);
        if (f && f.per !== t.sum_over) say(`${r} adds up ${t.of} over ${t.sum_over}, but ${t.of} isn't a fact of each item there.`);
        if (t.where) check(t.where, r, t.sum_over, negated);
      } else if ("fact" in t) {
        const f = where(t.fact, r, scope);
        if (f && !f.numeric) say(`${r} adds up ${t.fact}, which isn't numeric.`);
      } else if (!computed.get(t.computed)?.numeric) say(`${r} adds up ${t.computed}, which isn't a numeric computed fact.`);
    }
  };

  // `scope` is "case", or the list a "some" is looking inside. `negated` is true under an odd number of "not"s.
  const check = (c: Condition, r: string, scope: string, negated = false): void => {
    if ("all" in c) return c.all.forEach((x) => check(x, r, scope, negated));
    if ("any" in c) return c.any.forEach((x) => check(x, r, scope, negated));
    if ("not" in c) return check(c.not, r, scope, !negated);
    if ("some" in c) {
      if (!collections.has(c.some)) say(`${r} uses a list that isn't declared: ${c.some}.`);
      if (scope !== "case") say(`${r} nests "some ${c.some}" inside "some ${scope}".`);
      return check(c.where, r, c.some, negated);
    }
    if ("at_least" in c && !Number.isFinite(c.at_least)) say(`${r} compares with ${c.at_least}, which isn't a number.`);
    if ("sum" in c) return checkTerms(c.sum, r, scope, negated);
    // "Is not unknown" would let a rule stop applying just because a fact is unknown: an unknown must never help.
    if ("is_unknown" in c && negated) say(`${r} applies only once ${c.fact} is known, so an unknown ${c.fact} hides it.`);
    if ("fact" in c) return checkFact(c, r, scope);
    checkComputed(c, r);
  };

  const ids = new Set<string>();
  for (const r of spec.rules) {
    if (ids.has(r.id)) say(`Two rules share the ID ${r.id}.`);
    ids.add(r.id);
    if (!spec.order.includes(r.then)) say(`Rule ${r.id} leads to "${r.then}", which isn't in the order.`);
    check(r.when, `Rule ${r.id}`, "case");
  }
  for (const c of spec.collections) {
    // An empty list the spec allows ends "some" with no, so the empty rule is read as if under a "not".
    if (c.empty_ok_when) check(c.empty_ok_when, `The empty rule for ${c.key}`, "case", true);
    if (c.counts_when) check(c.counts_when, `Who counts in ${c.key}`, c.key);
    // Who counts is read both ways ("some" under a "not" too), so asking whether a fact is unknown there could let
    // filling it in take back an answer.
    if (c.counts_when && JSON.stringify(c.counts_when).includes('"is_unknown"')) {
      say(`Who counts in ${c.key} asks whether a fact is unknown; an unknown must never decide who counts.`);
    }
  }
  // A computed fact the spec adds up itself is numeric.
  for (const c of spec.computed) {
    if (!c.sum) continue;
    if (!c.numeric) say(`The computed fact ${c.key} is a sum, so it must be numeric.`);
    checkTerms(c.sum, `The sum for ${c.key}`, "case", false);
  }
  // Nothing depends on itself: not a sum through its own parts, nor a list through who counts in it, its
  // empty rule, or a sum over it.
  const deps = (node: string) => {
    const out: string[] = [];
    const cond = (c: Condition | undefined): void => {
      if (!c) return;
      if ("all" in c) return c.all.forEach(cond);
      if ("any" in c) return c.any.forEach(cond);
      if ("not" in c) return cond(c.not);
      if ("some" in c) { out.push(`list ${c.some}`); return cond(c.where); }
      if ("sum" in c) return terms(c.sum);
      if ("computed" in c) out.push(`computed ${c.computed}`);
    };
    const terms = (ts: Term[] | undefined) => (ts ?? []).forEach((t) => {
      if ("sum_over" in t) { out.push(`list ${t.sum_over}`); cond(t.where); } else if ("computed" in t) out.push(`computed ${t.computed}`);
    });
    const [kind, key] = node.split(" ");
    if (kind === "computed") terms(computed.get(key)?.sum);
    else { cond(collections.get(key)?.counts_when); cond(collections.get(key)?.empty_ok_when); }
    return out;
  };
  const done = new Set<string>(), path: string[] = [];
  const visit = (node: string): void => {
    if (path.includes(node)) return void say(`${node} depends on itself (${[...path.slice(path.indexOf(node)), node].join(" → ")}).`);
    if (done.has(node)) return;
    path.push(node);
    deps(node).forEach(visit);
    path.pop();
    done.add(node);
  };
  for (const c of spec.computed) visit(`computed ${c.key}`);
  for (const c of spec.collections) visit(`list ${c.key}`);
  for (const [key, words] of Object.entries(spec.maps ?? {})) {
    const f = facts.get(key);
    if (!f) say(`The word map for ${key} names a fact that isn't declared.`);
    else for (const [w, v] of Object.entries(words)) {
      // The evaluator looks a word up trimmed and in lower case, and an unknown must never read as known.
      if (w !== w.trim().toLowerCase()) say(`The word map for ${key} has "${w}", which no case word can match; write it trimmed and in lower case.`);
      if (w === "unknown") say(`The word map for ${key} reads "unknown" as "${v}": an unknown must stay unknown.`);
      if (f.values?.length && !f.values.includes(v)) say(`The word map for ${key} reads "${w}" as "${v}", which isn't one of its values.`);
      // Otherwise no case could ever give that value, and every rule on it would be silently dead.
      if (f.values?.includes(w) && v !== w) say(`The word map for ${key} reads its own value "${w}" as "${v}".`);
    }
  }
  return problems;
}
