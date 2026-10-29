// Prints the Z3 formula for each rule next to the SOP sentence it came from: pnpm show-z3 [spec file] [--raw]
// The translation from spec to Z3 is plain code (core/z3.ts), not a model call, so this is the whole of it.
// Each rule becomes two formulas: when it applies, and when it certainly doesn't. Neither holding means
// it might apply, because a fact it needs is unknown. Fact values print as names; --raw prints Z3's own numbers.
import { loadSpec } from "./load.ts";
import { ruleFormulas } from "./rule-formulas.ts";
import { shutdown } from "./z3.ts";

const args = process.argv.slice(2);
const spec = loadSpec(args.find((a) => !a.startsWith("--")) ?? "spec/kyb-v1.json");
const { enc, formulas, counts } = await ruleFormulas(spec, args.includes("--raw"));

const col = spec.collections[0], colFact = spec.facts.find((f) => f.per === col?.key);
console.log(`${spec.sop.file}, revision ${spec.sop.revision}.` + (col && colFact
  ? ` A list's facts end in 0 or 1 for its first or second item: ${colFact.key}1_c is ${col.item} 2's, and ${col.key}0_c says ${col.item} 1 exists.\n` : "\n"));
if (args.includes("--raw")) for (const [k, vs] of Object.entries(enc.dom)) console.log(`  ${k}: ${vs.labels.map((v, i) => `${i}=${v}`).join(" ")}`);
spec.rules.forEach((r, i) => {
  console.log(`${r.sop}  ${r.text}`);
  console.log(`  rule ${r.id}, leads to ${r.then}`);
  console.log(`  applies when:        ${formulas[i].applies}`);
  console.log(`  certainly not when:  ${formulas[i].certainly_not}\n`);
});
for (const f of counts) {
  const c = spec.collections.find((x) => x.key === f.list)!;
  console.log(`${c.sop ?? ""}  ${c.text ?? ""}`);
  console.log(`  who counts in ${c.key}, shown for ${c.item} 1`);
  console.log(`  counts when:         ${f.counts}`);
  console.log(`  certainly not when:  ${f.certainly_not}\n`);
}
console.log(`Outcome: the first of ${spec.order.join(" > ")} that a rule applying leads to (${spec.order_sop}). A rule that might apply counts as ${spec.unknowns.then} (${spec.unknowns.sop}).`);
await shutdown();
