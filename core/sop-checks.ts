// Checks on the SOP itself, run once per spec version. Each check asks Z3 a question about every possible case.
// Findings come out in the shape the pane's Spec tab reads (spec.json "findings"). Claude adds the question
// and options for the expert in a later step; Z3 supplies everything else.
import { type Case, evaluate } from "./evaluate.ts";
import { type Spec, validateSpec } from "./spec.ts";
import { domains, Encoder, z3Context } from "./z3.ts";

export type Finding = {
  id: string;
  kind: "contradiction" | "unknowns" | "gap" | "uncovered" | "judgment";
  rule_ids: string[];
  sop_refs: string[];
  title: string;
  example: string | null;
  example_facts: { key: string; name: string; value: string; list?: string; item?: number }[];  // item counts from 1
  explain: string;
  proof: { asks: string; code: string; answer: "sat" | "unsat" | "unknown"; ms: number };
};

type Model = Parameters<Encoder["readCase"]>[0];

async function ask(enc: Encoder, constraints: unknown[]) {
  const s = new enc.ctx.Solver();
  for (const c of constraints) s.add(c as never);
  const t = performance.now();
  const answer = (await s.check()) as "sat" | "unsat" | "unknown";
  return { answer, ms: Math.round(performance.now() - t), model: answer === "sat" ? (s.model() as unknown as Model) : null };
}

const name = (k: string) => k.replace(/_/g, " ");

// How many items each list needs for Z3 to cover every case, not just small ones. Each "some item" condition
// needs at most one item to make it hold or leave it unknown, and "no item" conditions only get harder to meet as
// items are added. So if a case exists at all, one exists with no more items than there are "some" conditions,
// counted once for each copy of the case a check compares (and at least one, so a list can be non-empty).
export function slotsNeeded(specs: Spec[], copies: number) {
  let n = 0;
  const walk = (c: object) => { for (const [k, v] of Object.entries(c)) { if (k === "some") n++; if (typeof v === "object" && v) walk(v); } };
  for (const s of specs) { s.rules.forEach((r) => walk(r.when)); s.collections.forEach((c) => c.empty_ok_when && walk(c.empty_ok_when)); }
  return Math.max(1, n * copies);
}

// The proofs hold for cases with any number of items: say how many Z3 needed to look at.
const upTo = (enc: Encoder) => (enc.spec.collections.length ? ` (any number of items; ${enc.slots} per list cover every case)` : "");

function assertValid(spec: Spec) {
  const problems = validateSpec(spec);
  if (problems.length) throw new Error(`The spec has problems; fix them before running Z3:\n${problems.join("\n")}`);
}

// Z3's example case, run through the evaluator. The two are separate copies of the rules, so an example
// whose outcome they disagree on is a bug here, not a finding.
function replay(spec: Spec, c: ReturnType<Encoder["readCase"]>, expect: (outcome: string) => boolean, what: string) {
  const kase: Case = { facts: c.facts, computed: c.computed,
    items: Object.fromEntries(Object.entries(c.items).map(([list, xs]) => [list, xs.map((x, i) => ({ name: `${list} ${i + 1}`, ...x }))])) };
  const { outcome } = evaluate(spec, kase);
  if (!expect(outcome)) throw new Error(`Z3 and the evaluator disagree on the example for ${what}: the evaluator says ${outcome}.`);
}

// A plain list of the facts in an example case that differ from a clean case, so the example is short.
function exampleFacts(c: ReturnType<Encoder["readCase"]>, keys: Set<string>) {
  const out: Finding["example_facts"] = [];
  for (const [k, v] of Object.entries(c.facts)) if (keys.has(k)) out.push({ key: k, name: name(k), value: v });
  for (const [list, items] of Object.entries(c.items)) items.forEach((x, i) => {
    for (const [k, v] of Object.entries(x)) if (keys.has(k)) out.push({ key: k, name: name(k), value: v, list, item: i + 1 });
  });
  for (const [k, v] of Object.entries(c.computed)) if (keys.has(k)) out.push({ key: k, name: name(k), value: String(v) });
  return out;
}

const factsOf = (spec: Spec, ruleIds: string[]) => {
  const keys = new Set<string>();
  const walk = (c: object) => { for (const [k, v] of Object.entries(c)) { if (k === "fact" || k === "computed") keys.add(v as string); else if (typeof v === "object" && v) walk(v); } };
  spec.rules.filter((r) => ruleIds.includes(r.id)).forEach((r) => walk(r.when));
  return keys;
};

// A rule that can never decide a case: whenever it applies, a more severe rule applies too.
export async function deadRules(spec: Spec, enc: Encoder): Promise<Finding[]> {
  const s = enc.symCase("dead");
  const { rules, outcome } = enc.run(s);
  const out: Finding[] = [];
  for (const r of rules) {
    // A rule whose conditions can't all hold at once never applies at all; no other rule is to blame.
    const can = await ask(enc, [...s.domain, r.applies]);
    if (can.answer === "unsat") {
      out.push({
        id: `dead-${r.rule.id}`, kind: "contradiction", rule_ids: [r.rule.id], sop_refs: [r.rule.sop],
        title: `${r.rule.sop} can never apply`,
        example: null, example_facts: [],
        explain: `No case meets all of ${r.rule.sop}'s conditions at once, so it never applies.`,
        proof: { asks: `Is there any case${upTo(enc)} where ${r.rule.sop} applies?`, code: `solver.add(applies("${r.rule.id}"))`, answer: can.answer, ms: can.ms },
      });
      continue;
    }
    const { answer, ms } = await ask(enc, [...s.domain, r.applies, outcome.eq(spec.order.indexOf(r.rule.then))]);
    if (answer !== "unsat") continue;  // "unknown" (the solver gave up) is not a proof
    // Which more severe rules always win? Report the ones that apply in every case where this one does.
    const winners: string[] = [];
    for (const w of rules.filter((x) => spec.order.indexOf(x.rule.then) < spec.order.indexOf(r.rule.then))) {
      if ((await ask(enc, [...s.domain, r.applies, enc.ctx.Not(w.applies)])).answer === "unsat") winners.push(w.rule.id);
    }
    const winnerRules = spec.rules.filter((x) => winners.includes(x.id));
    out.push({
      id: `dead-${r.rule.id}`, kind: "contradiction", rule_ids: [r.rule.id, ...winners], sop_refs: [r.rule.sop, ...winnerRules.map((x) => x.sop), spec.order_sop],
      title: `${r.rule.sop} can never decide a case`,
      example: null, example_facts: [],
      explain: `Whenever ${r.rule.sop} applies, ${winnerRules.map((x) => x.sop).join(" and ") || "a more severe rule"} applies too, and ${spec.order_sop} says the most severe outcome governs. So no case is ever decided by ${r.rule.sop}.`,
      proof: { asks: `Is there any case${upTo(enc)} where ${r.rule.sop} applies and decides the outcome?`, code: `solver.add(applies("${r.rule.id}"), outcome.eq("${r.rule.then}"))`, answer, ms },
    });
  }
  return out;
}

// A rule that applies only because a fact is unknown, and leads somewhere other than the spec's unknowns
// outcome (KYB 2.2). Example: KYB 3.4 asks for documents when an ID check simply hasn't come back.
export async function unknownTriggers(spec: Spec, enc: Encoder): Promise<Finding[]> {
  const a = enc.symCase("u"), b = enc.symCase("k");
  const ra = enc.run(a), rb = enc.run(b);
  const out: Finding[] = [];
  const item = (list: string) => spec.collections.find((c) => c.key === list)?.item ?? list;
  const label = (f: Finding["example_facts"][number]) => `${f.name}${f.item ? ` for ${item(f.list!)} ${f.item}` : ""}`;
  for (let i = 0; i < ra.rules.length; i++) {
    const r = ra.rules[i].rule;
    if (r.then === spec.unknowns.then) continue;
    // The rule decides the case while a fact is unknown, and once the facts are known it doesn't apply
    // and the case comes out differently.
    const then = spec.order.indexOf(r.then);
    const query = [...a.domain, ...b.domain, ...enc.completes(a, b), ra.rules[i].applies, ra.outcome.eq(then),
                   enc.ctx.Not(rb.rules[i].applies), rb.outcome.neq(then)];
    const { answer, ms } = await ask(enc, query);
    if (answer !== "sat") continue;
    // The shortest example: as few unknown facts as possible, and one item per list where that's enough,
    // so a person sees only the fact that matters.
    const oneEach = Object.values(a.items).flatMap((slots) => slots.slice(1).map((x) => enc.ctx.Not(x.present)));
    let model: Model | null = null;
    for (let k = 1; !model; k++) {
      const fewest = [...query, enc.unknownCount(a).le(k)];
      model = (await ask(enc, [...fewest, ...oneEach])).model ?? (await ask(enc, fewest)).model;
    }
    const ex = enc.readCase(model, a), known = enc.readCase(model, b);
    replay(spec, ex, (o) => o === r.then, `${r.sop} with a fact unknown`);
    replay(spec, known, (o) => o !== r.then, `${r.sop} once the facts are known`);
    const above = spec.order.indexOf(r.then) < spec.order.indexOf(spec.unknowns.then);
    const facts = exampleFacts(ex, factsOf(spec, [r.id])).filter((f) => f.value === "unknown");
    const later = exampleFacts(known, new Set(facts.map((f) => f.key))).filter((k) => facts.some((f) => f.key === k.key && f.list === k.list && f.item === k.item));
    out.push({
      id: `unknown-${r.id}`, kind: "unknowns", rule_ids: [r.id], sop_refs: [r.sop, spec.unknowns.sop],
      title: `${r.sop} treats an unknown fact differently from ${spec.unknowns.sop}`,
      example: `${facts.map((f) => `${label(f)} is unknown`).join(", ")}. If ${later.map((f) => `${label(f)} turned out "${f.value}"`).join(" and ")}, ${r.sop} would not apply.`,
      example_facts: facts,
      explain: `In this case ${r.sop} leads to ${r.then.replace("_", " ")} only because a fact is unknown. ${spec.unknowns.sop} says a case with an unknown fact is ${spec.unknowns.then}, ` +
        (above ? `and ${spec.order_sop} ranks ${r.then.replace("_", " ")} above ${spec.unknowns.then}, so ${r.sop} wins.` : `yet the case comes out ${r.then.replace("_", " ")}.`),
      proof: { asks: `Is there a case${upTo(enc)} that ${r.sop} decides, but that it would not apply to, and that would come out differently, once its unknown facts are known?`,
               code: `solver.add(completes(c, known), applies("${r.id}", c), outcome(c).eq("${r.then}"), Not(applies("${r.id}", known)), outcome(known).neq("${r.then}"))`, answer, ms },
    });
  }
  return out;
}

// A fact the spec collects but that can never change an outcome.
export async function unusedFacts(spec: Spec, enc: Encoder): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const f of spec.facts) {
    const a = enc.symCase(`f1${f.key}`), b = enc.symCase(`f2${f.key}`);
    const { And } = enc.ctx;
    const same = [
      // Everything the same, except this fact (for a list's fact, only in the first item).
      ...Object.keys(a.facts).filter((k) => k !== f.key).map((k) => a.facts[k].eq(b.facts[k])),
      ...Object.entries(a.items).flatMap(([list, slots]) => slots.flatMap((p, i) => [p.present.eq(b.items[list][i].present),
        ...Object.keys(p.facts).filter((k) => !(i === 0 && k === f.key)).map((k) => p.facts[k].eq(b.items[list][i].facts[k]))])),
      ...Object.keys(a.computed).map((k) => a.computed[k].eq(b.computed[k])),
      ...Object.keys(a.numeric).map((k) => And(a.numeric[k].known.eq(b.numeric[k].known), a.numeric[k].value.eq(b.numeric[k].value))),
    ];
    const { answer, ms } = await ask(enc, [...a.domain, ...b.domain, ...same, enc.run(a).outcome.neq(enc.run(b).outcome)]);
    if (answer !== "unsat") continue;
    const users = spec.rules.filter((r) => factsOf(spec, [r.id]).has(f.key));
    out.push({
      id: `unused-${f.key}`, kind: "contradiction", rule_ids: users.map((r) => r.id), sop_refs: users.map((r) => r.sop),
      title: `${name(f.key)} never changes an outcome`,
      example: null, example_facts: [],
      explain: users.length
        ? `Only ${users.map((r) => r.sop).join(" and ")} use${users.length === 1 ? "s" : ""} ${name(f.key)}, and no case's outcome depends on it. Collecting it is wasted work unless a rule changes.`
        : `No rule uses ${name(f.key)}.`,
      proof: { asks: `Are there two cases${upTo(enc)} that differ only in ${name(f.key)} and get different outcomes?`, code: `solver.add(sameExcept("${f.key}", a, b), outcome(a).neq(outcome(b)))`, answer, ms },
    });
  }
  return out;
}

export async function checkSop(spec: Spec): Promise<Finding[]> {
  assertValid(spec);
  // The unknowns and unused-fact checks compare two copies of a case.
  const ctx = await z3Context(), one = new Encoder(ctx, spec, slotsNeeded([spec], 1)), two = new Encoder(ctx, spec, slotsNeeded([spec], 2));
  return [...(await deadRules(spec, one)), ...(await unknownTriggers(spec, two)), ...(await unusedFacts(spec, two))];
}

// The cases whose outcome changes between two spec versions, one example for each change of outcome.
export async function diffSpecs(a: Spec, b: Spec) {
  const slots = slotsNeeded([a, b], 1);
  assertValid(a);
  assertValid(b);
  // Both versions read one symbolic case, so they must have the same facts, in the same places, and the same
  // computed facts. Their values may differ: a list that gains a country is the kind of change to compare.
  const shape = (x: Spec) => JSON.stringify([x.facts.map((f) => [f.key, f.per]).sort(), x.computed.map((c) => [c.key, !!c.numeric]).sort(),
                                            x.collections.map((c) => c.key).sort()]);
  if (shape(a) !== shape(b)) throw new Error("The two versions use different facts; compare them fact by fact first.");
  const ctx = await z3Context(), dom = domains(a, [b]);
  const ea = new Encoder(ctx, a, slots, dom), eb = new Encoder(ctx, b, slots, dom);
  const s = ea.symCase("diff");
  const oa = ea.run(s).outcome, ob = eb.run(s).outcome;
  const changes: { from: string; to: string; example: ReturnType<Encoder["readCase"]> }[] = [];
  for (const from of a.order) for (const to of b.order) {
    if (from === to) continue;
    const { model } = await ask(ea, [...s.domain, oa.eq(a.order.indexOf(from)), ob.eq(b.order.indexOf(to))]);
    if (!model) continue;
    const example = ea.readCase(model, s);
    replay(a, example, (o) => o === from, `version ${a.version}'s ${from}`);
    replay(b, example, (o) => o === to, `version ${b.version}'s ${to}`);
    changes.push({ from, to, example });
  }
  return changes;
}
