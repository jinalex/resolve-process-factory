// Runs Resolve on a KYB spec and case files and writes the pane's files: pnpm resolve [spec file] [--out dir] [--cases dir]
// Defaults: spec/kyb-v1.json, the six example case files, and .resolve/ at the repo root. Paths you give are
// read from the folder you ran the command in.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT } from "../../core/load.ts";
import { shutdown } from "../../core/z3.ts";
import { writePane } from "./pane.ts";

const here = process.env.INIT_CWD ?? process.cwd();
const opts: Record<string, string> = {};
const rest: string[] = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (!a.startsWith("--")) { rest.push(a); continue; }
  if (a !== "--out" && a !== "--cases") { console.error(`Unknown option ${a}. Usage: pnpm resolve [spec file] [--out dir] [--cases dir]`); process.exit(2); }
  const v = args[++i];
  if (!v || v.startsWith("--")) { console.error(`${a} needs a folder.`); process.exit(2); }
  opts[a.slice(2)] = resolve(here, v);
}
const specFile = rest[0] ? resolve(here, rest[0]) : join(ROOT, "spec/kyb-v1.json");
const out = opts.out ?? join(ROOT, ".resolve");

try {
  const spec = JSON.parse(readFileSync(specFile, "utf8"));
  const { findings, cases } = await writePane({ spec, out, ...(opts.cases ? { caseFiles: opts.cases } : {}) });
  console.log(`Wrote ${out}: ${findings.length} findings on the rules, ${cases.filter((c) => c.check.passed).length} of ${cases.length} case files pass.`);
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await shutdown();
}
