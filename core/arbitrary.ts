// Random specs and cases for property tests: any spec in the rule format, not a pack's. A few case facts, one
// list of items, a sum, and rules built from every kind of condition. Numbers sit at and next to the thresholds,
// where a rounding or an off-by-one would show.
import fc from "fast-check";
import type { Case, Value } from "./evaluate.ts";
import { type Condition, type Spec, type Term, validateSpec } from "./spec.ts";

export const OUTCOMES = ["o1", "o2", "o3", "o4"];      // most severe first
export const BARS = [0, 25, 50, 100];
export const NUMBERS: Value[] = [0, 24, 25, 26, 49, 50, 51, 99, 100, 24.5, "1/3", "100/3", "200/3", "-1/3"];

// Case facts: k1 and k2 take one of a, b, c; code takes any word; n is a number; flag is a yes/no fact the pack
// works out. Each item of the list has g (x or y) and a number w. total is a sum the spec works out itself.
export const base = (): Omit<Spec, "order" | "unknowns" | "rules" | "collections"> => ({
  domain: "test", version: 1, sop: { file: "sop.md", revision: "1" }, order_sop: "1",
  facts: [
    { key: "k1", per: "case", values: ["a", "b", "c"] }, { key: "k2", per: "case", values: ["a", "b", "c"] },
    { key: "code", per: "case" }, { key: "n", per: "case", numeric: true },
    { key: "g", per: "items", values: ["x", "y"] }, { key: "w", per: "items", numeric: true },
  ],
  computed: [{ key: "flag" }, { key: "total", numeric: true, sum: [{ fact: "n" }, { sum_over: "items", of: "w" }] }],
  lists: { ab: ["a", "b"] },
  maps: { k1: { alpha: "a", "big c": "c" } },
});

const bar = fc.constantFrom(...BARS);
const value = fc.constantFrom("a", "b", "c");

// A condition about one item of the list (inside "some", and who counts).
const itemCondition: fc.Arbitrary<Condition> = fc.letrec<{ c: Condition }>((tie) => ({
  c: fc.oneof({ depthSize: "small", withCrossShrink: true },
    fc.record({ fact: fc.constant("g"), is: fc.constantFrom("x", "y") }),
    fc.record({ fact: fc.constant("g"), is_unknown: fc.constant(true as const) }),
    fc.record({ fact: fc.constant("w"), at_least: bar }),
    fc.record({ fact: fc.constant("w"), is_unknown: fc.constant(true as const) }),
    fc.record({ fact: fc.constant("g"), in: fc.constant<string[]>(["x"]) }),
    fc.record({ sum: fc.constant<Term[]>([{ fact: "w" }, { fact: "n" }]), at_least: bar }),
    fc.record({ fact: fc.constant("k1"), is: value }),
    fc.record({ all: fc.array(tie("c"), { minLength: 1, maxLength: 3 }) }),
    fc.record({ any: fc.array(tie("c"), { minLength: 1, maxLength: 3 }) }),
    fc.record({ not: tie("c") })),
})).c;

// A condition about the case. `withList` false leaves out anything that looks at the list (for its empty rule).
const caseCondition = (withList: boolean): fc.Arbitrary<Condition> => fc.letrec<{ c: Condition }>((tie) => ({
  c: fc.oneof({ depthSize: "small", withCrossShrink: true },
    fc.record({ fact: fc.constantFrom("k1", "k2"), is: value }),
    fc.record({ fact: fc.constantFrom("k1", "k2"), in: fc.constantFrom<string[] | string>(["a"], ["b", "c"], "ab") }),
    fc.record({ fact: fc.constantFrom("k1", "k2", "n"), is_unknown: fc.constant(true as const) }),
    fc.record({ fact: fc.constant("code"), is: fc.constantFrom("US", "GB") }),
    fc.record({ fact: fc.constant("n"), at_least: bar }),
    fc.record({ computed: fc.constant("flag"), is: fc.constantFrom("yes", "no") }),
    ...(withList ? [
      fc.record({ computed: fc.constant("total"), at_least: bar }),
      fc.record({ sum: fc.constant<Term[]>([{ fact: "n" }, { sum_over: "items", of: "w", where: { fact: "g", is: "x" } }]), at_least: bar }),
      fc.record({ some: fc.constant("items"), where: itemCondition }),
    ] : []),
    fc.record({ all: fc.array(tie("c"), { minLength: 1, maxLength: 3 }) }),
    fc.record({ any: fc.array(tie("c"), { minLength: 1, maxLength: 3 }) }),
    fc.record({ not: tie("c") })),
})).c;

// A well-formed spec. A made-up one validateSpec rejects is skipped, as the loader would refuse it.
const specArb: fc.Arbitrary<Spec> = fc.record({
  unknowns: fc.constantFrom(...OUTCOMES),
  rules: fc.array(fc.record({ when: caseCondition(true), then: fc.constantFrom(...OUTCOMES) }), { minLength: 1, maxLength: 5 }),
  counts_when: fc.option(itemCondition, { nil: undefined }),
  empty_ok_when: fc.option(caseCondition(false), { nil: undefined }),
  total_where: fc.option(itemCondition, { nil: undefined }),  // which items the spec's own sum adds up
}).map(({ unknowns, rules, counts_when, empty_ok_when, total_where }) => ({
  ...base(), order: OUTCOMES, unknowns: { sop: "1", text: "", then: unknowns },
  computed: [{ key: "flag" }, { key: "total", numeric: true, sum: [{ fact: "n" }, { sum_over: "items", of: "w", ...(total_where ? { where: total_where } : {}) }] }],
  rules: rules.map((r, i) => ({ id: `r${i}`, sop: `${i}`, text: "", ...r })),
  collections: [{ key: "items", item: "item", ...(counts_when ? { counts_when } : {}), ...(empty_ok_when ? { empty_ok_when } : {}) }],
})).filter((s) => validateSpec(s).length === 0);

// A case with every fact known, and which of its facts to hide. The refined case hides fewer of them, so it is
// the same case with some unknowns filled in. A list the case doesn't give can be filled in as an empty one, but
// a list keeps its items: adding an item is new evidence, not an unknown filled in.
type Slot = { key: string; known: Value; unknownAs: Value };
type Draft = { facts: Slot[]; items: Slot[][]; flag: Slot; listHidden: boolean };
// "maybe" is unknown only where a fact has declared values or is a number; code takes any word, so it isn't.
const UNKNOWN_WORDS: Value[] = ["unknown", null, undefined, ""];
const slot = (key: string, known: fc.Arbitrary<Value>, unknownAs = fc.constantFrom(...UNKNOWN_WORDS, "maybe")) =>
  fc.record({ key: fc.constant(key), known, unknownAs });
const draftArb: fc.Arbitrary<Draft> = fc.record({
  facts: fc.tuple(slot("k1", fc.constantFrom("a", "b", "c", "alpha", " Big C")), slot("k2", value),
                  slot("code", fc.constantFrom("US", "GB", "FR"), fc.constantFrom(...UNKNOWN_WORDS)), slot("n", fc.constantFrom(...NUMBERS))),
  items: fc.array(fc.tuple(slot("g", fc.constantFrom("x", "y")), slot("w", fc.constantFrom(...NUMBERS))), { maxLength: 3 }),
  flag: slot("flag", fc.constantFrom("yes", "no")),
  listHidden: fc.boolean(),
});
// One flag per slot, and one for whether the list is given: which are hidden. Read in the order build() visits them.
const masksArb = (n: number) => fc.tuple(fc.array(fc.boolean(), { minLength: n, maxLength: n }), fc.array(fc.boolean(), { minLength: n, maxLength: n }));
const slots = (d: Draft) => 1 + d.facts.length + d.items.length * 2 + 1;

function build(d: Draft, hidden: boolean[]): Case {
  let i = 0;
  const show = (s: Slot) => (hidden[i++] ? s.unknownAs : s.known);
  const listGone = hidden[i++] && d.listHidden && !d.items.length;
  const facts = Object.fromEntries(d.facts.map((s) => [s.key, show(s)]));
  const items = d.items.map((pair, k) => ({ name: `item ${k}`, ...Object.fromEntries(pair.map((s) => [s.key, show(s)])) }));
  return { facts, items: { items: listGone ? null : items }, computed: { flag: show(d.flag) } };
}

// A spec, a case, and the same case with some of its unknowns filled in.
export const refinedArb = specArb.chain((spec) => draftArb.chain((d) => masksArb(slots(d)).map(([hide, keep]) => {
  const coarse = hide, fine = hide.map((h, k) => h && keep[k]); // hidden in the refined case only if hidden in the first
  return { spec, c: build(d, coarse), refined: build(d, fine) };
})));
