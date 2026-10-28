// Checks the hand-made case files for the six examples and prints what Resolve says: pnpm check-cases
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Documents, checkCase } from "./case-file.ts";
import { ROOT } from "../../core/load.ts";
import { kybSpec } from "./examples.ts";

const spec = kybSpec();
const dir = join(ROOT, "packs/kyb/fixtures/case-files");
for (const name of readdirSync(dir).sort()) {
  const f = JSON.parse(readFileSync(join(dir, name), "utf8"));
  const r = checkCase(spec, f, new Documents(join(ROOT, "cases/examples", f.dir)));
  console.log(`${f.case_id}  ${r.passed ? "passed" : "FAILED"}  file says ${f.outcome}, spec gives ${r.outcome}`);
  for (const p of r.problems) console.log(`   problem: ${p.text}`);
  for (const x of r.flags) console.log(`   flag:    ${x}`);
  for (const x of r.missing) console.log(`   missing: ${x}`);
  for (const x of r.notes) console.log(`   note:    ${x}`);
}
