// The rule format. Rules are data: a condition on named facts and the outcome it leads to.
// Claude writes specs in this format (later PRs), Z3 checks them, and the evaluator runs them.
// Nothing here knows about KYB: a spec names its own outcomes, facts and lists of items (people,
// expense lines, transactions). A condition can only use the building blocks below; anything else
// is a finding for a person.

export type Outcome = string;

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { some: string; where: Condition }                             // some item in a list, e.g. some person
  | { fact: string; is: string }                                   // unknown value -> unknown
  | { fact: string; in: string[] | string }                        // a literal list, or a named list in `lists`
  | { fact: string; is_unknown: true }                             // is this fact unknown? always yes or no
  | { computed: string; is: string }
  | { computed: string; at_least: number };

export type Rule = {
  id: string;          // stable across versions; answers and findings point at it
  sop: string;         // the SOP section, e.g. "3.3"
  text: string;        // the SOP sentence it came from
  when: Condition;
  then: Outcome;
};

// A fact belongs to the case as a whole, or to each item of one of the case's lists.
export type FactDecl = { key: string; per: "case" | string; values: string[] };

// A list of items the SOP talks about. With no items, "some item" is unknown, unless `empty_ok_when` holds,
// e.g. KYB needs no identified individuals for an excluded entity. `unknown_when_empty` names what's unknown then,
// for notes ("who the identified individuals are").
export type Collection = { key: string; item: string; empty_ok_when?: Condition; unknown_when_empty?: string };

// A fact the domain's own code works out from the raw case, e.g. KYB's ownership completeness.
export type ComputedDecl = { key: string; values?: string[]; numeric?: boolean };

export type Spec = {
  domain: string;                      // which pack computes this spec's computed facts, e.g. "kyb"
  version: number;
  sop: { file: string; revision: string };
  order: Outcome[];                    // most severe first; the first outcome with a rule that applies wins
  order_sop: string;                   // the SOP section that sets the order, e.g. "2.1"
  unknowns: { sop: string; text: string; then: Outcome }; // what a rule that might apply leads to
  facts: FactDecl[];
  collections: Collection[];
  computed: ComputedDecl[];
  lists: Record<string, string[]>;
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
  for (const f of spec.facts) {
    if (f.per !== "case" && !collections.has(f.per)) say(`The fact ${f.key} belongs to a list that isn't declared: ${f.per}.`);
  }

  // A fact is used where it lives (a case fact outside "some", an item's fact inside it) and with its own values.
  const checkFact = (c: Extract<Condition, { fact: string }>, r: string, scope: string) => {
    const f = facts.get(c.fact);
    if (!f) return say(`${r} uses a fact that isn't declared: ${c.fact}.`);
    if (f.per !== scope && f.per === "case") say(`${r} uses the case fact ${c.fact} inside "some ${scope}".`);
    if (f.per !== scope && f.per !== "case") say(`${r} uses ${c.fact}, which belongs to each item of ${f.per}, outside "some ${f.per}".`);
    if ("in" in c && typeof c.in === "string") {
      if (!spec.lists[c.in]) say(`${r} uses a value list that isn't declared: ${c.in}.`);
      return;
    }
    const compared = "is" in c ? [c.is] : "in" in c ? c.in : [];
    for (const v of compared) {
      if (f.values.length && !f.values.includes(v)) say(`${r} compares ${c.fact} with "${v}", which isn't one of its values.`);
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

  // `scope` is "case", or the list a "some" is looking inside.
  const check = (c: Condition, r: string, scope: string): void => {
    if ("all" in c) return c.all.forEach((x) => check(x, r, scope));
    if ("any" in c) return c.any.forEach((x) => check(x, r, scope));
    if ("not" in c) return check(c.not, r, scope);
    if ("some" in c) {
      if (!collections.has(c.some)) say(`${r} uses a list that isn't declared: ${c.some}.`);
      if (scope !== "case") say(`${r} nests "some ${c.some}" inside "some ${scope}".`);
      return check(c.where, r, c.some);
    }
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
    if (c.empty_ok_when) check(c.empty_ok_when, `The empty rule for ${c.key}`, "case");
  }
  return problems;
}
