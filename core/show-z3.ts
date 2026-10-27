// Prints the Z3 formula for each rule next to the SOP sentence it came from: pnpm show-z3 [spec file] [--raw]
// The translation from spec to Z3 is plain code (core/z3.ts), not a model call, so this is the whole of it.
// Each rule becomes two formulas: when it applies, and when it certainly doesn't. Neither holding means
// it might apply, because a fact it needs is unknown. Fact values print as names; --raw prints Z3's own numbers.
import { loadSpec } from "./load.ts";
import { Encoder, shutdown, z3Context } from "./z3.ts";

const args = process.argv.slice(2);
const spec = loadSpec(args.find((a) => !a.startsWith("--")) ?? "spec/kyb-v1.json");
const ctx = await z3Context();
const enc = new Encoder(ctx, spec, 2);
const s = enc.symCase("c");

// "(= pep0_c 0)" -> "(= pep0_c yes)": each fact is a number standing for one of its values, last is unknown.
const named = (x: string) => args.includes("--raw") ? x : x.replace(/\(= ([a-z_]+?)(\d?)_c (\d+)\)/g, (m, key: string, slot: string, n: string) =>
  enc.dom[key] ? `(= ${key}${slot}_c ${enc.dom[key][Number(n)]})` : m)
  // "not no and not unknown" is just "yes" when a fact has two values.
  .replace(/\(and \(not \(= ([a-z_]+?)(\d?)_c ([a-z_]+)\)\) \(not \(= \1\2_c unknown\)\)\)/g, (m, key: string, slot: string, v: string) => {
    const rest = enc.dom[key]?.filter((x) => x !== v && x !== "unknown");
    return rest?.length === 1 ? `(= ${key}${slot}_c ${rest[0]})` : m;
  });

const col = spec.collections[0], colFact = spec.facts.find((f) => f.per === col?.key);
console.log(`${spec.sop.file}, revision ${spec.sop.revision}.` + (col && colFact
  ? ` A list's facts end in 0 or 1 for its first or second item: ${colFact.key}1_c is ${col.item} 2's, and ${col.key}0_c says ${col.item} 1 exists.\n` : "\n"));
if (args.includes("--raw")) for (const [k, vs] of Object.entries(enc.dom)) console.log(`  ${k}: ${vs.map((v, i) => `${i}=${v}`).join(" ")}`);
for (const r of spec.rules) {
  const { y, n } = enc.cond(r.when, s);
  console.log(`${r.sop}  ${r.text}`);
  console.log(`  rule ${r.id}, leads to ${r.then}`);
  console.log(`  applies when:        ${named((await ctx.simplify(y)).sexpr()).replace(/\n\s*/g, " ")}`);
  console.log(`  certainly not when:  ${named((await ctx.simplify(n)).sexpr()).replace(/\n\s*/g, " ")}\n`);
}
console.log(`Outcome: the first of ${spec.order.join(" > ")} that a rule applying leads to (${spec.order_sop}). A rule that might apply counts as ${spec.unknowns.then} (${spec.unknowns.sop}).`);
await shutdown();
