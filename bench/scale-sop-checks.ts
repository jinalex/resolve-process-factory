import { checkSop, slotsNeeded } from "../core/sop-checks.ts";
import type { Spec } from "../core/spec.ts";
import { shutdown } from "../core/z3.ts";
import { kybSpec } from "../packs/kyb/examples.ts";
const k = Number(process.argv[2]);
const base = kybSpec(), s: Spec = structuredClone(base);
// k copies of the person facts and of every rule, each copy using its own facts.
for (let i = 1; i < k; i++) {
  const ren = (key: string) => (base.facts.some((f) => f.key === key) ? `${key}_${i}` : key);
  for (const f of base.facts) s.facts.push({ ...f, key: ren(f.key) });
  const map = (c: any): any => Array.isArray(c) ? c.map(map) : c && typeof c === "object" ? Object.fromEntries(Object.entries(c).map(([a, v]) => [a, a === "fact" ? ren(v as string) : map(v)])) : c;
  for (const r of base.rules) s.rules.push({ ...r, id: `${r.id}_${i}`, sop: `${r.sop}.${i}`, when: map(r.when) });
}
const t = performance.now();
const { deadRules, unknownTriggers, unusedFacts } = await import("../core/sop-checks.ts"); const { Encoder, z3Context } = await import("../core/z3.ts"); const ctx = await z3Context(); for (const [nm, fn, c] of [["dead", deadRules, 1], ["unknowns", unknownTriggers, 2], ["unused", unusedFacts, 2]] as const) { const t0 = performance.now(); await fn(s, new Encoder(ctx, s, slotsNeeded([s], c))); console.log(nm, Math.round(performance.now() - t0), "ms"); } const f: unknown[] = [];
console.log(`x${k}: ${s.rules.length} rules, ${slotsNeeded([s], 1)}/${slotsNeeded([s], 2)} slots, ${f.length} findings, ${Math.round((performance.now() - t) / 1000)} s`);
await shutdown();
