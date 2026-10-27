// Checks on an agent's evidence that don't depend on the domain: every quote is really in the cited document,
// every vendor field says what the agent read from it, and the outcome follows from the facts under the spec.
// Resolve never decides whether a fact is true. A pack adds its own checks (KYB: the control person's reasons,
// adverse media's bar) on top of these.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Result } from "./evaluate.ts";

// One piece of evidence. Documents are cited with a quote ("cap_table.md p.1"), vendor results with a field.
export type Evidence = { value: string; source: string; quote?: string; field?: string };
// A fact: the value the agent settled on, plus any other evidence that says something different.
export type Fact = Evidence & { conflicts?: Evidence[]; how?: "lookup" | "judgment" };

// "missing", "quote" and "outcome" come from here; a pack adds its own kinds.
export type Problem = { kind: string; text: string; fact?: string };

// Reads cited documents from the case's folder. "cap_table.md p.2" means page 2 of cap_table.md.
export class Documents {
  private readonly dir: string;
  constructor(dir: string) { this.dir = dir; }
  private parse(source: string) {
    const m = /^(\S+?)(?:\s+p\.(\d+))?$/.exec(source.trim());
    return m ? { file: m[1], page: m[2] ? Number(m[2]) : null } : null;
  }
  text(source: string): string | null {
    const s = this.parse(source);
    if (!s || !existsSync(join(this.dir, s.file))) return null;
    const all = readFileSync(join(this.dir, s.file), "utf8");
    if (s.page === null) return all;
    const pages = all.split(/\*\*Page \d+ of \d+\*\*/);
    return pages[s.page] ?? null; // pages[0] is the header before page 1
  }
  json(source: string): unknown {
    const s = this.parse(source);
    if (!s || !s.file.endsWith(".json") || !existsSync(join(this.dir, s.file))) return undefined;
    return JSON.parse(readFileSync(join(this.dir, s.file), "utf8"));
  }
}

export const squash = (s: string) => s.replace(/\*\*|\|/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

function field(obj: unknown, path: string): unknown {
  let x: unknown = obj;
  for (const k of path.split(".")) { if (x === null || typeof x !== "object" || !(k in x)) return undefined; x = (x as Record<string, unknown>)[k]; }
  return x;
}

// What a vendor result's field says about a fact, for the fields a pack knows how to read. undefined means "can't tell".
export type FieldReader = (key: string, raw: unknown) => string | undefined;

// Collects problems and flags while a pack walks its case file.
export class EvidenceCheck {
  readonly problems: Problem[] = [];
  readonly flags: string[] = [];
  private readonly docs: Documents;
  private readonly fieldSays: FieldReader;
  constructor(docs: Documents, fieldSays: FieldReader = () => undefined) { this.docs = docs; this.fieldSays = fieldSays; }

  say(kind: string, text: string, fact?: string) { this.problems.push({ kind, text, ...(fact ? { fact } : {}) }); }

  // The quote is really in the cited document. Evidence without a quote passes here.
  quote(e: { source: string; quote?: string }, what: string): boolean {
    if (!e.quote) return true;
    const text = this.docs.text(e.source);
    if (text === null) { this.say("quote", `${what} cites ${e.source}, which isn't among the case's documents.`, what); return false; }
    if (!squash(text).includes(squash(e.quote))) { this.say("quote", `The quote "${e.quote}" for ${what} isn't in ${e.source}.`, what); return false; }
    return true;
  }

  // A fact is cited, its evidence is really there, and other evidence that disagrees is flagged. Returns its value.
  fact(f: Fact | undefined, what: string, key: string): string {
    if (!f) { this.say("missing", `${what} is missing.`, what); return "unknown"; }
    if (!f.source || (!f.quote && !f.field)) this.say("missing", `${what} has no source the file can point to.`, what);
    else if (f.field) {
      const doc = this.docs.json(f.source);
      const raw = doc === undefined ? undefined : field(doc, f.field);
      if (doc === undefined) this.say("quote", `${what} cites ${f.source}, which isn't among the case's results.`, what);
      else if (raw === undefined) this.say("quote", `${what} cites the field ${f.field} in ${f.source}, which doesn't exist.`, what);
      else { const says = this.fieldSays(key, raw); if (says !== undefined && says !== f.value) this.say("quote", `${what} says "${f.value}", but ${f.source} (${f.field}) says "${says}".`, what); }
    } else this.quote(f, what);
    for (const c of f.conflicts ?? []) {
      this.fact({ ...c }, `${what} (other evidence)`, key);
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
  return [...pending].map(([what, sops]) => `${what[0].toUpperCase()}${what.slice(1)} is still unknown, and ${sops.join(" and ")} need${sops.length === 1 ? "s" : ""} it.`);
}
