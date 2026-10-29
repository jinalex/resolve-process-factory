// Verifies the Dafny evaluator and compiles it to core/dafny/evaluate.cjs, which core/evaluate.ts calls.
// `pnpm build-dafny` rewrites the file; `pnpm build-dafny --check` fails if the committed file is out of date.
// Needs Dafny 4.11 on the PATH (or DAFNY set to its binary); running Resolve and its tests does not.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../load.ts";

const dafny = process.env.DAFNY ?? "dafny";
const out = join(mkdtempSync(join(tmpdir(), "resolve-dafny-")), "evaluate.js");
execFileSync(dafny, ["translate", "js", "--include-runtime", "--unicode-char:false", join(ROOT, "core/dafny/evaluate.dfy"), "-o", out], { stdio: "inherit" });

const target = join(ROOT, "core/dafny/evaluate.cjs");
const compiled = "// Compiled from evaluate.dfy by `pnpm build-dafny`. Do not edit.\n"
  + readFileSync(out, "utf8") + "\nmodule.exports = { _dafny, Resolve, BigNumber };\n";
if (process.argv.includes("--check")) {
  if (readFileSync(target, "utf8") !== compiled) {
    console.error("core/dafny/evaluate.cjs is out of date: run pnpm build-dafny and commit it.");
    process.exit(1);
  }
  console.log("core/dafny/evaluate.cjs matches evaluate.dfy.");
} else {
  writeFileSync(target, compiled);
  console.log(`wrote ${target}`);
}
