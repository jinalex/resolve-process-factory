// Turns the owner's sent answers into the next KYB spec version: pnpm next-spec [spec file] [--out dir]
// Reads the pane's spec.json and answers.jsonl in --out (default .resolve/), writes spec/<domain>-v<n+1>.json
// unapproved, and runs pnpm resolve's checks on it, so the pane shows the new version with what it changes.
// Defaults to spec/kyb-v1.json. Paths you give are read from the folder you ran the command in.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { readAnswers } from "../../core/answers.ts";
import { ROOT } from "../../core/load.ts";
import { nextSpec } from "../../core/next-spec.ts";
import { shutdown } from "../../core/z3.ts";
import { pastCases } from "./examples.ts";
import { writePane } from "./pane.ts";

const here = process.env.INIT_CWD ?? process.cwd();
const args = process.argv.slice(2);
const i = args.indexOf("--out");
const out = i >= 0 ? resolve(here, args[i + 1] ?? ".") : join(ROOT, ".resolve");
const rest = args.filter((_, k) => k !== i && k !== i + 1);
const specFile = rest[0] ? resolve(here, rest[0]) : join(ROOT, "spec/kyb-v1.json");
const read = (f: string, what: string) => {
  try { return readFileSync(f, "utf8"); } catch { throw new Error(`There's no ${what} at ${f}.`); }
};

try {
  const spec = JSON.parse(read(specFile, "spec"));
  const pane = JSON.parse(read(join(out, "spec.json"), "spec.json from pnpm resolve"));
  let text = "";
  try { text = readFileSync(join(out, "answers.jsonl"), "utf8"); } catch { /* nothing answered yet */ }
  const answers = readAnswers(text, spec.version);
  for (const p of answers.problems) console.log(`Left out: ${p}`);
  if (answers.verdicts.length) console.log(`Left out: ${answers.verdicts.length} verdicts on past cases; they don't change the rules yet.`);

  const r = await nextSpec(spec, { path: relative(ROOT, specFile) }, pane, answers.findings, pastCases());
  if (!r.spec) {
    for (const p of r.problems) console.error(p);
    process.exitCode = 1;
  } else {
    const target = join(ROOT, "spec", `${r.spec.domain}-v${r.spec.version}.json`);
    // A version number names one spec for good: answers and approvals point at it.
    if (existsSync(target)) throw new Error(`${relative(ROOT, target)} already exists; a version is never overwritten.`);
    writeFileSync(target, JSON.stringify(r.spec, null, 2) + "\n");
    console.log(`Wrote ${relative(ROOT, target)}, unapproved, from ${r.rulings.length} ${r.rulings.length === 1 ? "answer" : "answers"}.`);
    for (const x of r.rulings) console.log(`  "${x.question}" → ${x.choice}${x.edits.length ? "" : " (rules kept as they are)"}`);
    if (!r.changes.length) console.log("No case decides differently.");
    for (const c of r.changes) console.log(`  ${c.example}`);
    for (const f of r.flips) console.log(`  ${f.case_id} ${f.name}: ${f.from} → ${f.to}`);
    console.log(`Z3 on version ${r.spec.version}: ${r.findings.length} ${r.findings.length === 1 ? "finding" : "findings"}.`);
    for (const f of r.findings) console.log(`  [${f.kind}] ${f.title}`);
    await writePane({ spec: r.spec, out });
    console.log(`Wrote ${out} for version ${r.spec.version}. The owner approves it in the pane.`);
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await shutdown();
}
