// Which spec file a command works on when none is named. One rule for every command: a file you name, else the
// version the pane shows (spec/<domain>-v<n>.json, from --out's spec.json), else KYB's v1, the worked example.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT } from "./load.ts";

export const DEFAULT_SPEC = "spec/kyb-v1.json";
export const DEFAULT_OUT = join(ROOT, ".resolve");

// The spec file for the version the pane shows, or null when --out has no readable spec.json. A version whose file
// is missing, or holds another version, is an error: falling back would roll the pane back to v1.
export function shownSpecFile(out: string): string | null {
  let s: { domain?: unknown; version?: unknown };
  try { s = JSON.parse(readFileSync(join(out, "spec.json"), "utf8")); } catch { return null; }
  if (typeof s.domain !== "string" || !Number.isInteger(s.version)) return null;
  const rel = `spec/${s.domain}-v${s.version}.json`, file = join(ROOT, rel);
  let version: unknown;
  try { version = JSON.parse(readFileSync(file, "utf8")).version; } catch {
    throw new Error(`The pane shows spec v${s.version}, but ${rel} isn't there. Name the spec file to use.`);
  }
  if (version !== s.version) throw new Error(`${rel} holds version ${String(version)}, not ${s.version}. Name the spec file to use.`);
  return file;
}

// The spec file to use, as an absolute path. A named file is read from `here`, the folder the command ran in.
export function currentSpecFile(named: string | undefined, out = DEFAULT_OUT, here = process.env.INIT_CWD ?? process.cwd()): string {
  return named ? resolve(here, named) : shownSpecFile(out) ?? join(ROOT, DEFAULT_SPEC);
}
