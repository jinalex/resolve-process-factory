// Runs Resolve on the KYB spec and case files and writes the pane's files: pnpm resolve [spec file] [--out dir] [--cases dir]
// --out defaults to .resolve/ in the folder you run it from, which is where the pane looks.
import { join, resolve } from "node:path";
import { loadSpec } from "../../core/load.ts";
import { shutdown } from "../../core/z3.ts";
import { writePane } from "./pane.ts";

const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const out = resolve(flag("--out") ?? join(process.env.INIT_CWD ?? process.cwd(), ".resolve"));
const caseFiles = flag("--cases");
const spec = loadSpec(args[0] ?? "spec/kyb-v1.json");

const { findings, cases } = await writePane({ spec, out, ...(caseFiles ? { caseFiles: resolve(caseFiles) } : {}) });
console.log(`Wrote ${out}: ${findings.length} findings on the rules, ${cases.filter((c) => c.check.passed).length} of ${cases.length} case files pass.`);
await shutdown();
