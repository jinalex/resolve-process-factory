// Made-up SOPs for measuring and testing the SOP checks: the same seed always gives the same SOP.
// They are shaped like a real one. Sections have their own facts, including one about each person; a few case
// facts are read across the SOP (the entity type, whether it is exempt, its country); the first section is
// screening, the only one that reads the shared screening facts about people. `tangle` is the chance a rule
// also reads a fact from another section, which is what ties sections together.
import type { Condition, FactDecl, Rule, Spec } from "../core/spec.ts";
import { kybSpec } from "../packs/kyb/examples.ts";

function random(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function randomSop(rules: number, { seed = 1, tangle = 0.05, perSection = 6 } = {}): Spec {
  const rnd = random(seed), pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const order = ["decline", "escalate", "request_docs", "incomplete", "approve"];
  const facts: FactDecl[] = [
    { key: "exempt", per: "case", values: ["yes", "no"] },
    { key: "entity_type", per: "case", values: ["company", "partnership", "trust", "nonprofit"] },
    { key: "country", per: "case", values: [] },
    { key: "pep", per: "people", values: ["yes", "no"] },
    { key: "sanctions", per: "people", values: ["none", "potential", "confirmed"] },
    { key: "residence", per: "people", values: [] },
  ];
  const shared = facts.filter((f) => f.per === "case"), people = facts.filter((f) => f.per === "people");
  const sections: FactDecl[][] = [];
  const value = (f: FactDecl) => (f.values.length ? pick(f.values) : pick(["US", "GB", "IR", "KP", "VE", "DE"]));
  const atom = (f: FactDecl): Condition => {
    const r = rnd();
    if (r < 0.1) return { fact: f.key, is_unknown: true };
    if (r < 0.25 && f.values.length > 2) return { fact: f.key, in: f.values.slice(0, 2) };
    return { fact: f.key, is: value(f) };
  };
  const out: Rule[] = [];
  for (let i = 0; i < rules; i++) {
    const s = Math.floor(i / perSection);
    if (!sections[s]) {
      const own: FactDecl[] = [...Array(3).keys()].map((j) => ({ key: `s${s}_f${j}`, per: "case", values: j === 2 ? ["low", "medium", "high"] : ["yes", "no"] }));
      own.push({ key: `s${s}_check`, per: "people", values: ["pass", "fail"] });
      facts.push(...own);
      sections.push(own);
    }
    const local = sections[s].filter((f) => f.per === "case");
    const parts: Condition[] = [atom(pick(local))];
    if (rnd() < 0.6) parts.push(atom(pick(local)));
    if (rnd() < 0.3) parts.push(atom(pick(shared)));
    const personal = (t: number) => [...(t === 0 ? people : []), ...sections[t].filter((f) => f.per === "people")];
    if (rnd() < 0.3) parts.push({ some: "people", where: atom(pick(personal(s))) });
    if (rnd() < tangle && s > 0) {
      const t = Math.floor(rnd() * s);
      parts.push(rnd() < 0.3 ? { some: "people", where: atom(pick(personal(t))) } : atom(pick(sections[t].filter((f) => f.per === "case"))));
    }
    const when: Condition = parts.length === 1 ? parts[0] : rnd() < 0.7 ? { all: parts } : { any: parts };
    out.push({ id: `r${i}`, sop: `${s + 1}.${(i % perSection) + 1}`, text: "", when: rnd() < 0.1 && !JSON.stringify(when).includes("is_unknown") ? { not: when } : when, then: pick(order.slice(0, 4)) });
  }
  return {
    domain: "random", version: 1, sop: { file: "", revision: "" }, order, order_sop: "2.1",
    unknowns: { sop: "2.2", text: "", then: "incomplete" }, facts,
    collections: [{ key: "people", item: "person", empty_ok_when: { fact: "exempt", is: "yes" } }],
    computed: [], lists: {}, rules: out,
  };
}

// KYB copied k times, each copy with its own facts, all sharing the list of people. Copies never interact.
export function kybCopies(k: number): Spec {
  const base = kybSpec(), s: Spec = structuredClone(base);
  for (let i = 1; i < k; i++) {
    const ren = (key: string) => (base.facts.some((f) => f.key === key) ? `${key}_${i}` : key);
    for (const f of base.facts) s.facts.push({ ...f, key: ren(f.key) });
    const map = (c: unknown): unknown => Array.isArray(c) ? c.map(map) : c && typeof c === "object"
      ? Object.fromEntries(Object.entries(c).map(([a, v]) => [a, a === "fact" ? ren(v as string) : map(v)])) : c;
    for (const r of base.rules) s.rules.push({ ...r, id: `${r.id}_${i}`, sop: `${r.sop}.${i}`, when: map(r.when) as Condition });
  }
  return s;
}
