// Checks on an agent's evidence that don't depend on the domain: every quote is really in the cited document,
// every vendor field says what the agent read from it, and the outcome follows from the facts under the spec.
// Resolve never decides whether a fact is true. A pack adds its own checks (KYB: the control person's reasons,
// adverse media's bar) on top of these.
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Result } from "./evaluate.ts";

// One piece of evidence. Documents are cited with a quote ("cap_table.md p.1"), vendor results with a field.
export type Evidence = { value: string; source: string; quote?: string; field?: string };
// A fact: the value the agent settled on, plus any other evidence that says something different.
export type Fact = Evidence & { conflicts?: Evidence[]; how?: "lookup" | "judgment" };

// "missing", "quote" and "outcome" come from here; a pack adds its own kinds.
export type Problem = { kind: string; text: string; fact?: string };

// Reads cited documents from the case's folder. "cap_table.md p.2" means page 2 of cap_table.md.
// A source outside the folder, or one that can't be read, is simply not among the case's documents.
export class Documents {
  private readonly dir: string;
  constructor(dir: string) { this.dir = resolve(dir); }
  private read(file: string): string | null {
    const path = resolve(this.dir, file);
    if (!path.startsWith(this.dir + sep)) return null;
    try { return readFileSync(path, "utf8"); } catch { return null; }
  }
  private parse(source: unknown) {
    const m = typeof source === "string" ? /^(\S+?)(?:\s+p\.(\d+))?$/.exec(source.trim()) : null;
    return m ? { file: m[1], page: m[2] ? Number(m[2]) : null } : null;
  }
  text(source: unknown): string | null {
    const s = this.parse(source);
    const all = s && this.read(s.file);
    if (!s || all === null) return null;
    if (s.page === null) return all;
    const pages = all.split(/\*\*Page \d+ of \d+\*\*/);
    return pages[s.page] ?? null; // pages[0] is the header before page 1
  }
  json(source: unknown): unknown {
    const s = this.parse(source);
    const raw = s && s.file.endsWith(".json") ? this.read(s.file) : null;
    if (raw === null) return undefined;
    try { return JSON.parse(raw); } catch { return undefined; }
  }
}

export const squash = (s: string) => s.replace(/\*\*|\|/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

function field(obj: unknown, path: string): unknown {
  let x: unknown = obj;
  for (const k of path.split(".")) { if (x === null || typeof x !== "object" || !Object.hasOwn(x, k)) return undefined; x = (x as Record<string, unknown>)[k]; }
  return x;
}

// What a vendor result's field says about a fact, for the fields a pack knows how to read: the value, or the values
// it allows (a sanctions hit is "potential" or "confirmed"; a person decides which). undefined means the field can't
// be read for that fact (no reader, or the wrong shape), and citing it is a problem.
export type FieldReader = (key: string, raw: unknown) => string | string[] | undefined;

// Collects problems and flags while a pack walks its case file.
export class EvidenceCheck {
  readonly problems: Problem[] = [];
  readonly flags: string[] = [];
  private readonly docs: Documents;
  private readonly fieldSays: FieldReader;
  private readonly extra: Map<string, string[]>;
  // `extra` holds sources that aren't files, e.g. KYB's "web": the texts of the web results the file cites. A quote
  // must be in one of them.
  constructor(docs: Documents, fieldSays: FieldReader = () => undefined, extra = new Map<string, string[]>()) {
    this.docs = docs; this.fieldSays = fieldSays; this.extra = extra;
  }

  say(kind: string, text: string, fact?: string) { this.problems.push({ kind, text, ...(fact ? { fact } : {}) }); }

  // The quote is really in the cited document. A quote that is only spaces or formatting ("|", "**") is no quote.
  // Evidence without a quote passes here unless `required`: a fact may cite a vendor field instead.
  quote(e: { source?: unknown; quote?: unknown }, what: string, required = false): boolean {
    const q = typeof e.quote === "string" ? squash(e.quote) : "";
    if (!q) {
      if (e.quote !== undefined || required) { this.say("missing", `${what} has no quote from its source.`, what); return false; }
      return true;
    }
    const texts = typeof e.source === "string" && this.extra.has(e.source) ? this.extra.get(e.source)! : [this.docs.text(e.source)].filter((t) => t !== null);
    if (!texts.length) { this.say("quote", `${what} cites ${String(e.source)}, which isn't among the case's documents.`, what); return false; }
    if (!texts.some((t) => squash(t).includes(q))) { this.say("quote", `The quote "${e.quote}" for ${what} isn't in ${e.source}.`, what); return false; }
    return true;
  }

  // A fact is cited, its evidence is really there, and other evidence that disagrees is flagged. Returns its value.
  // `about` is who the fact is about: a vendor result that names someone else ("subject", "name" or "company") is
  // the wrong result.
  fact(f: Fact | undefined, what: string, key: string, about?: string): string {
    if (!f) { this.say("missing", `${what} is missing.`, what); return "unknown"; }
    if (!f.source || (!f.quote && !f.field)) this.say("missing", `${what} has no source the file can point to.`, what);
    if (f.source && f.field) {
      const doc = this.docs.json(f.source);
      const raw = doc === undefined ? undefined : field(doc, f.field);
      const says = raw === undefined ? undefined : this.fieldSays(key, raw);
      const allowed = says === undefined ? undefined : [says].flat();
      const named = doc && typeof doc === "object" ? ["subject", "name", "company"].map((k) => field(doc, k)).find((v) => typeof v === "string") : undefined;
      if (doc === undefined) this.say("quote", `${what} cites ${f.source}, which isn't among the case's results.`, what);
      else if (about && typeof named === "string" && squash(named) !== squash(about)) this.say("quote", `${what} cites ${f.source}, which is about ${named}, not ${about}.`, what);
      else if (raw === undefined) this.say("quote", `${what} cites the field ${f.field} in ${f.source}, which doesn't exist.`, what);
      else if (!allowed) this.say("quote", `${what} cites the field ${f.field} in ${f.source}, which can't be read as ${what}.`, what);
      else if (!allowed.includes(f.value)) this.say("quote", `${what} says "${f.value}", but ${f.source} (${f.field}) says "${allowed.join('" or "')}".`, what);
    }
    if (f.source && f.quote) this.quote(f, what);  // a quote is checked even when a field is cited too
    for (const c of f.conflicts ?? []) {
      this.fact({ ...c }, `${what} (other evidence)`, key, about);
      if (c.value !== f.value) this.flags.push(`Documents disagree on ${what}: ${f.source} says ${f.value}, ${c.source} says ${c.value}. The file uses ${f.value}; a person should confirm.`);
    }
    return f.value;
  }

  // The outcome the agent wrote is the one the spec gives on the file's facts.
  outcome(claimed: string, r: Result) {
    if (claimed === r.outcome) return;
    const why = r.decided_by.map((h) => (h.because ? `${h.sop} might apply (${h.because.join(", ")} unknown)` : `${h.sop} applies`)).join("; ");
    this.say("outcome", `The file says ${claimed.replace("_", " ")}, but the facts in it lead to ${r.outcome.replace("_", " ")}: ${why}.`);
  }
}

// What's still needed, from the rules that might apply: one sentence per unknown fact, naming the sections that need it.
export function pendingFacts(r: Result): string[] {
  const pending = new Map<string, string[]>();
  for (const h of r.might_apply) { const k = h.because?.join(" and ") ?? "a fact"; pending.set(k, [...(pending.get(k) ?? []), h.sop]); }
  return [...pending].map(([what, sops]) => `${what.charAt(0).toUpperCase()}${what.slice(1)} is still unknown, and ${sops.join(" and ")} need${sops.length === 1 ? "s" : ""} it.`);
}
