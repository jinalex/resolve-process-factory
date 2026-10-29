// What one answer to a finding would do, worked out before the owner picks it. Each option carries the spec edit
// Claude wrote for it (core/spec-edit.ts); this applies the edit and asks the same questions a person would:
// does the edit hold together, does the finding go away, does it raise a new one, which kinds of case decide
// differently (Z3, over every case), and which past cases flip (the evaluator, on each one).
import { type Case, evaluate } from "./evaluate.ts";
import { applyEdits, textProblems, type SpecEdit } from "./spec-edit.ts";
import type { Outcome, Spec } from "./spec.ts";
import { checkSop, diffSpecs, exampleFacts, factsOf, type Finding } from "./sop-checks.ts";
import { domains } from "./z3.ts";

// A case decided before, as the pack hands it over: its facts in the evaluator's shape, and what the team decided.
// The decision is evidence, not ground truth (principle 8): a flip is shown for a person to judge.
export type PastCase = { id: string; name: string; decision: Outcome | null; case: Case };

export type OptionEdits = { option: string; says: string; edits: SpecEdit[] };

// A kind of case that decides differently, with one made-up example from Z3.
export type Change = { from: Outcome; to: Outcome; example: string; example_facts: Finding["example_facts"] };

export type Impact = {
  option: string;
  problems: string[];            // why the edit can't be used; when present, nothing below is filled
  keeps_rules: boolean;          // the option changes nothing: the owner accepts the rules as they are
  resolves: boolean;             // Z3 no longer reports the finding
  new_findings: { id: string; title: string }[];
  changes: Change[];             // every kind of case that decides differently (none: no case changes)
  flips: { case_id: string; name: string; from: Outcome; to: Outcome }[];
  matches_past: number | null;   // past cases whose team decision the edited rules give; null when none has one
  ms: number;
};

const words = (k: string) => k.replace(/_/g, " ");

// The rules an edit could change the outcome of: the ones it touches, or every rule when it changes the order,
// the outcome for unknowns, who counts or a list. Used only to pick which facts an example shows.
function touched(a: Spec, b: Spec) {
  const same = (x: Spec) => JSON.stringify([x.order, x.unknowns, x.collections, x.lists]);
  if (same(a) !== same(b)) return { a: a.rules.map((r) => r.id), b: b.rules.map((r) => r.id) };
  const before = new Map(a.rules.map((r) => [r.id, JSON.stringify(r)]));
  const after = new Map(b.rules.map((r) => [r.id, JSON.stringify(r)]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].filter((id) => before.get(id) !== after.get(id));
  return { a: ids.filter((id) => before.has(id)), b: ids.filter((id) => after.has(id)) };
}

type Example = Awaited<ReturnType<typeof diffSpecs>>[number]["example"];
const asCase = (c: Example): Case => ({ facts: c.facts, computed: c.computed,
  items: Object.fromEntries(Object.entries(c.items).map(([list, xs]) => [list, xs && xs.map((x, i) => ({ name: `${list} ${i + 1}`, ...x }))])) });

// Z3's example, cut down to what makes it flip, so a person reads two or three facts, not every fact the rules
// read. The evaluator does the cutting on concrete cases: drop items while the case still flips, then show only
// the facts where some other value would stop it flipping. The cut example is checked again before it is shown.
function essentials(a: Spec, b: Spec, d: { from: Outcome; to: Outcome; example: Example }, keys: Set<string>) {
  const flipsAs = (c: Example) => evaluate(a, asCase(c)).outcome === d.from && evaluate(b, asCase(c)).outcome === d.to;
  const ex = structuredClone(d.example);
  for (const list of Object.keys(ex.items)) {
    while ((ex.items[list]?.length ?? 0) > 1) {
      const fewer = { ...ex, items: { ...ex.items, [list]: ex.items[list]!.slice(0, -1) } };
      if (!flipsAs(fewer)) break;
      ex.items = fewer.items;
    }
  }
  if (!flipsAs(ex)) throw new Error(`The example for ${d.from} becoming ${d.to} doesn't flip in the evaluator; this is a bug in Resolve.`);
  const dom = domains(a, [b]);
  const others = (key: string, v: unknown) => (dom[key]?.labels ?? ["unknown", 0, 100]).filter((x) => String(x) !== String(v));
  const matters = new Set<string>();
  const where = (group: "facts" | "computed", key: string) => {
    for (const alt of others(key, ex[group][key])) if (!flipsAs({ ...ex, [group]: { ...ex[group], [key]: alt } })) return matters.add(key);
  };
  for (const k of Object.keys(ex.facts)) if (keys.has(k)) where("facts", k);
  for (const k of Object.keys(ex.computed)) if (keys.has(k)) where("computed", k);
  for (const [list, xs] of Object.entries(ex.items)) {
    if (xs === null) { if (flipsAs({ ...ex, items: { ...ex.items, [list]: [] } }) === false) matters.add(list); continue; }
    xs.forEach((x, i) => {
      for (const k of Object.keys(x)) if (keys.has(k)) for (const alt of others(k, x[k])) {
        const changed = xs.map((y, j) => (j === i ? { ...y, [k]: alt } : y));
        if (!flipsAs({ ...ex, items: { ...ex.items, [list]: changed } })) { matters.add(`${list}.${i}.${k}`); break; }
      }
    });
  }
  return exampleFacts(ex, keys).filter((f) => f.list === undefined ? matters.has(f.key) : f.item === undefined ? matters.has(f.list) : matters.has(`${f.list}.${f.item - 1}.${f.key}`));
}

// Kinds of case that decide differently between two versions, each with a short example a person can read.
export async function changes(a: Spec, b: Spec): Promise<Change[]> {
  // The example shows the facts the edit reads; the sections that decide each version say why it lands where it does.
  const t = touched(a, b);
  const keys = new Set([...factsOf(a, t.a), ...factsOf(b, t.b)]);
  const by = (s: Spec, c: Example) => {
    const r = evaluate(s, asCase(c));
    // A case held back because a rule only might apply is decided by the unknowns section, not by those rules.
    const hits = r.decided_by.filter((h) => h.then === r.outcome);
    return hits.length ? ` (${[...new Set(hits.map((h) => h.sop))].join(", ")})` : r.outcome === s.unknowns.then ? ` (${s.unknowns.sop})` : "";
  };
  const item = (list: string) => a.collections.find((c) => c.key === list)?.item ?? list;
  return (await diffSpecs(a, b)).map((d) => {
    const facts = essentials(a, b, d, keys);
    const shown = facts.map((f) => `${f.list && f.item === undefined ? `no ${words(f.list)} are listed` : `${words(f.name)}${f.item ? ` for ${item(f.list!)} ${f.item}` : ""} is ${f.value === "unknown" ? "unknown" : `"${f.value}"`}`}`);
    return { from: d.from, to: d.to, example_facts: facts,
             example: `When ${shown.join(" and ") || "the rest of the case allows it"}, the case now comes out ${words(d.from)}${by(a, d.example)} and would come out ${words(d.to)}${by(b, d.example)}.` };
  });
}

// Past cases whose outcome differs between two versions.
export function flips(a: Spec, b: Spec, past: PastCase[]) {
  return past.flatMap((p) => {
    const from = evaluate(a, p.case).outcome, to = evaluate(b, p.case).outcome;
    return from === to ? [] : [{ case_id: p.id, name: p.name, from, to }];
  });
}

// `sop` is the SOP's text, to check that every rule an edit writes quotes it.
export async function optionImpact(spec: Spec, finding: Pick<Finding, "id">, option: OptionEdits, past: PastCase[], sop: string): Promise<Impact> {
  const start = performance.now();
  const base = { option: option.option, keeps_rules: !option.edits?.length, resolves: false, new_findings: [], changes: [], flips: [], matches_past: null };
  const done = (x: Omit<Impact, "ms">): Impact => ({ ...x, ms: Math.round(performance.now() - start) });
  if (!Array.isArray(option.edits)) return done({ ...base, problems: ["The option has no list of edits."] });
  const applied = applyEdits(spec, option.edits), edited = applied.spec;
  const problems = [...applied.problems, ...textProblems(option.edits, sop)];
  if (problems.length) return done({ ...base, problems });
  const before = new Set((await checkSop(spec)).map((f) => f.id));
  const after = await checkSop(edited);
  return done({
    ...base, problems: [],
    resolves: !after.some((f) => f.id === finding.id),
    new_findings: after.filter((f) => !before.has(f.id)).map((f) => ({ id: f.id, title: f.title })),
    changes: option.edits.length ? await changes(spec, edited) : [],
    flips: flips(spec, edited, past),
    matches_past: past.some((p) => p.decision !== null) ? past.filter((p) => p.decision !== null && evaluate(edited, p.case).outcome === p.decision).length : null,
  });
}
