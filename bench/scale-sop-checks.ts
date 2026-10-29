// How long the SOP checks take as the SOP grows.
//   node bench/scale-sop-checks.ts copies 1 2 4 8      KYB copied k times; the copies share nothing
//   node bench/scale-sop-checks.ts sections 13 52 208  made-up SOPs with that many rules (bench/random-sop.ts)
// Options: --tangle 0.3 (how often a rule reads another section's fact), --groups whole|split-all (how to group
// the rules; see core/slice.ts), --seed n.
// Each line also times a one-rule change: the same SOP with its last rule's outcome changed, checked again.
import { deadRules, forgetAnswers, type Options, unknownTriggers, unusedFacts } from "../core/sop-checks.ts";
import { slice } from "../core/slice.ts";
import type { Spec } from "../core/spec.ts";
import { domains, shutdown, z3Context } from "../core/z3.ts";
import { kybCopies, randomSop } from "./random-sop.ts";

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  if (i < 0) return undefined;
  if (i + 1 >= args.length || args[i + 1].startsWith("--")) throw new Error(`${k} needs a value`);
  return args.splice(i, 2)[1];
};
const tangle = Number(opt("--tangle") ?? 0.05), seed = Number(opt("--seed") ?? 1);
const opts: Options = { groups: (opt("--groups") ?? "auto") as Options["groups"] };
const [kind, ...sizes] = args;
await z3Context();

async function run(spec: Spec) {
  const t: number[] = [];
  let n = 0;
  for (const check of [deadRules, unknownTriggers, unusedFacts]) {
    const t0 = performance.now();
    n += (await check(spec, opts)).length;
    t.push(Math.round(performance.now() - t0));
  }
  return { t, n, total: t.reduce((a, b) => a + b, 0) };
}

console.log(`${kind}${kind === "sections" ? `, tangle ${tangle}, seed ${seed}` : ""}, groups: ${opts.groups}`);
console.log("rules | groups | largest | split on | dead ms | unknowns ms | unused ms | total s | findings | one-rule change s");
for (const size of sizes.map(Number)) {
  const spec = kind === "copies" ? kybCopies(size) : randomSop(size, { seed, tangle });
  const { groups, split } = slice([spec], domains(spec), opts.groups);
  forgetAnswers();
  const full = await run(spec);
  const changed: Spec = structuredClone(spec), last = changed.rules[changed.rules.length - 1];
  last.then = last.then === "decline" ? "escalate" : "decline";
  const again = await run(changed);
  console.log([spec.rules.length, groups.length, Math.max(...groups.map((g) => g.entries.length)), split.join(" ") || "-",
    ...full.t, (full.total / 1000).toFixed(1), full.n, (again.total / 1000).toFixed(1)].join(" | "));
}
await shutdown();
