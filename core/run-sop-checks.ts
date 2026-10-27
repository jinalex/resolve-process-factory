// Runs Z3's checks on a spec and prints the findings: pnpm check-sop [spec file, default spec/kyb-v1.json] [--json]
// With --json it prints the findings in the shape the pane's spec.json uses.
import { loadSpec } from "./load.ts";
import { checkSop } from "./sop-checks.ts";
import { shutdown } from "./z3.ts";

const args = process.argv.slice(2);
const spec = loadSpec(args.find((a) => !a.startsWith("--")) ?? "spec/kyb-v1.json");
const t = performance.now();
const findings = await checkSop(spec);
if (args.includes("--json")) { console.log(JSON.stringify(findings, null, 2)); await shutdown(); process.exit(0); }
for (const f of findings) {
  console.log(`[${f.kind}] ${f.title}  (${f.proof.answer}, ${f.proof.ms} ms)`);
  console.log(`  ${f.explain}`);
  if (f.example) console.log(`  Example: ${f.example}`);
}
console.log(`${findings.length} findings in ${Math.round(performance.now() - t)} ms`);
await shutdown();
