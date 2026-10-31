// Which spec file a command works on when none is named. One rule for every command: a file you name, else the
// version the pane shows (spec/<domain>-v<n>.json, from --out's spec.json), else KYB's v1, the worked example.
import { linkSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { ROOT } from "./load.ts";
import { specHash } from "./pane.ts";

export const DEFAULT_SPEC = "spec/kyb-v1.json";
export const DEFAULT_OUT = join(ROOT, ".resolve");
// pnpm resolve keeps a copy of the spec it built the pane on beside the pane's files. A version next-spec wrote is
// a new file in spec/ that nothing commits, so without the copy the pane could point at a spec that is gone.
export const SPEC_COPY = "spec-copy.json";

type Shown = { domain?: unknown; version?: unknown; spec_hash?: unknown };

// The spec file for the version the pane shows, or null when --out has no readable spec.json. A version whose file
// is missing is put back from the pane's copy when the copy is that very spec, and is otherwise an error that names
// the newest spec to rebuild on: falling back on its own would roll the pane back without saying so.
export function shownSpecFile(out: string): string | null {
  let s: Shown;
  try { s = JSON.parse(readFileSync(join(out, "spec.json"), "utf8")); } catch { return null; }
  if (typeof s.domain !== "string" || !Number.isInteger(s.version)) return null;
  // The domain names a file in spec/, so it is a plain name: nothing in it can reach another folder.
  if (!/^[\w-]+$/.test(s.domain)) throw new Error(`The pane's spec.json names the domain ${JSON.stringify(s.domain)}, which isn't a plain name. Run pnpm resolve with a spec file to write it again.`);
  const rel = `spec/${s.domain}-v${s.version}.json`, file = join(ROOT, rel);
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch (e) {
    // Only a file that isn't there is put back. One that is there but can't be read or parsed is a person's to look at.
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    restore(out, s, file);
    return file;
  }
  let version: unknown;
  try { version = JSON.parse(text).version; } catch { throw new Error(`${rel} isn't valid JSON. Fix it, or name the spec file to use.`); }
  if (version !== s.version) throw new Error(`${rel} holds version ${String(version)}, not ${s.version}. Name the spec file to use.`);
  return file;
}

// Puts a missing spec file back from the pane's copy, or says what to run instead.
export function restore(out: string, s: Shown, file: string) {
  const rel = relative(ROOT, file);
  let copy: { domain?: unknown; version?: unknown } | null = null;
  try { copy = JSON.parse(readFileSync(join(out, SPEC_COPY), "utf8")); } catch { /* no copy: an older pane folder */ }
  if (!copy || copy.domain !== s.domain || copy.version !== s.version || specHash(copy as never) !== s.spec_hash) {
    const newest = newestSpec(s.domain as string);
    throw new Error(`The pane shows ${s.domain} spec v${s.version}, but ${rel} isn't there and ${shortPath(out)} has no copy of it. ` +
      (newest ? `To rebuild the pane on the newest spec there is, run: pnpm resolve ${newest}${out === DEFAULT_OUT ? "" : ` --out ${shortPath(out)}`}` : "Name the spec file to use."));
  }
  // Written whole beside it and linked into place, as next-spec writes a version, so it never overwrites one.
  const tmp = `${file}.${process.pid}.tmp`;
  let linked = false;
  try {
    writeFileSync(tmp, JSON.stringify(copy, null, 2) + "\n");
    linkSync(tmp, file);
    linked = true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
  } finally { try { unlinkSync(tmp); } catch { /* never written */ } }
  if (linked) { console.error(`${rel} was missing, so it was put back from the copy the pane was built on.`); return; }
  // Another run wrote the file first. It is used only if it is the very spec the pane was built on.
  let other: unknown = null;
  try { other = JSON.parse(readFileSync(file, "utf8")); } catch { /* checked below */ }
  if (!other || specHash(other as never) !== s.spec_hash) throw new Error(`${rel} appeared while this run was putting it back, and it isn't the spec the pane was built on. Name the spec file to use.`);
}

// The highest version in spec/ for a domain, as a path from the repo root, or null if there is none.
export function newestSpec(domain: string): string | null {
  const re = new RegExp(`^${domain.replace(/[^\w-]/g, "")}-v(\\d+)\\.json$`);
  const n = readdirSync(join(ROOT, "spec")).flatMap((f) => { const m = re.exec(f); return m ? [Number(m[1])] : []; });
  return n.length ? `spec/${domain}-v${Math.max(...n)}.json` : null;
}

// A folder as a person would type it from where they are: relative when it's below them, else in full.
export function shortPath(p: string) {
  const r = relative(process.env.INIT_CWD ?? process.cwd(), p);
  return r && !r.startsWith("..") ? r : r === "" ? "." : p;
}

// The spec file to use, as an absolute path. A named file is read from `here`, the folder the command ran in.
export function currentSpecFile(named: string | undefined, out = DEFAULT_OUT, here = process.env.INIT_CWD ?? process.cwd()): string {
  return named ? resolve(here, named) : shownSpecFile(out) ?? join(ROOT, DEFAULT_SPEC);
}
