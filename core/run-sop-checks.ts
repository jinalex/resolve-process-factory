// Runs Z3's checks on a spec and prints the findings: pnpm check-sop [spec file] [--json]
// Defaults to the version the pane shows, else spec/kyb-v1.json (core/current-spec.ts).
// With --json it prints the findings in the shape the pane's spec.json uses.
import { currentSpecFile } from "./current-spec.ts";
import { loadSpec } from "./load.ts";
import { checkSop } from "./sop-checks.ts";
import { shutdown } from "./z3.ts";

const args = process.argv.slice(2);
let spec;
try { spec = loadSpec(currentSpecFile(args.find((a) => !a.startsWith("--")))); } catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
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
