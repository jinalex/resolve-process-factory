// Each policy's saved model calls are kept as one file, <policy>/runs.json.gz, instead of a folder of JSON files
// (maintainer, 2026-10-30). The steps work on the folder <policy>/runs/, which is gitignored: unpack() fills it from
// the packed file when it is missing, and `run.ts <policy> pack` writes the packed file back after new runs.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

export function unpack(dir: string) {
  const runs = join(dir, "runs"), packed = join(dir, "runs.json.gz");
  mkdirSync(runs, { recursive: true });
  if (readdirSync(runs).length || !existsSync(packed)) return;
  const files: Record<string, string> = JSON.parse(gunzipSync(readFileSync(packed)).toString());
  for (const [name, text] of Object.entries(files)) writeFileSync(join(runs, name), text);
}

export function pack(dir: string) {
  const runs = join(dir, "runs");
  const files = Object.fromEntries(readdirSync(runs).filter((f) => f.endsWith(".json")).sort().map((f) => [f, readFileSync(join(runs, f), "utf8")]));
  writeFileSync(join(dir, "runs.json.gz"), gzipSync(JSON.stringify(files), { level: 9 }));
  return Object.keys(files).length;
}
