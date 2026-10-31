// An example evidence adapter for KYB's mock documents. Resolve takes facts as given; reading a value out of a
// document and showing it follows from its source is the evidence system's job (DECISIONS.md, "The evidence
// boundary"; issue #11). These readers and literal checks stand in for that system on the example documents, so the
// demo doesn't rest on values nobody looked at. They are not part of the core and don't claim to catch forgeries.
import { type EvidenceCheck, squash } from "../../core/evidence.ts";
import { type Frac, cmp, fromPercent } from "../../core/frac.ts";
import type { CaseFile, HolderEvidence } from "./case-file.ts";

// What a vendor result's field says, for the fields we know how to read. undefined means it can't be read for that
// fact (no reader, or the wrong shape), which the evidence check reports.
export function fieldSays(key: string, raw: unknown): string | string[] | undefined {
  if (key === "id_verified") return typeof raw !== "string" ? undefined : raw === "approved" ? "yes" : raw === "declined" ? "no" : "unknown";
  if (key === "residence") return typeof raw === "string" ? /,\s*([A-Z]{2})$/.exec(raw.trim())?.[1] : undefined;  // "…, Portland, OR 97210, US"
  if (key === "nationality") return typeof raw === "string" && /^[A-Z]{2}$/.test(raw) ? raw : undefined;
  if (["sanctions", "pep", "adverse_media"].includes(key)) {
    if (raw === null) return "unknown";
    if (!Array.isArray(raw)) return undefined;
    if (raw.length === 0) return key === "sanctions" ? "none" : "no";
    return key === "sanctions" ? ["potential", "confirmed"] : "yes"; // which of the two is for a person to decide
  }
  if (key === "licence_verified" && Array.isArray(raw)) {
    const active = (l: unknown) => typeof l === "object" && l !== null &&
      (l as { status?: unknown }).status === "Approved" && (l as { authorized_to_conduct_business?: unknown }).authorized_to_conduct_business === true;
    return raw.some(active) ? "yes" : "no";
  }
  return undefined;
}

// Who a vendor result is about: the example vendors name it "subject", "name" or "company".
export function subjectOf(doc: unknown): string | undefined {
  if (doc === null || typeof doc !== "object") return undefined;
  const named = ["subject", "name", "company"].map((k) => (Object.hasOwn(doc, k) ? (doc as Record<string, unknown>)[k] : undefined));
  return named.find((v) => typeof v === "string") as string | undefined;
}

// What a quote states literally: a share is one of the percentages written in it, and a date is written in it as
// YYYY-MM-DD or M/D/YYYY (the US registries' form).
const statesShare = (quote: string, pct: Frac) => [...quote.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].some((m) => cmp(fromPercent(m[1]), pct) === 0);
function statesDate(quote: string, iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const [, y, mo, d] = m, forms = [iso, `${mo}/${d}/${y}`, `${Number(mo)}/${Number(d)}/${y}`];
  return forms.some((f) => new RegExp(`(^|[^\\d/])${f.replace(/\//g, "\\/")}($|[^\\d/])`).test(quote));
}
// A share as the file writes it, or null if it isn't a percentage ("25%", "majority").
export function share(pct: number | string): Frac | null {
  try { return fromPercent(pct); } catch { return null; }
}

// A share, a holder's name and a filing date must be what their quote says. Only quotes that are present are read;
// a missing quote is the core's problem to report.
export function checkLiterals(file: CaseFile, ev: EvidenceCheck) {
  const states = (quote: unknown, name: string | null, pct: number | string) => {
    const p = share(pct);
    return typeof quote !== "string" || !squash(quote) || !name || !p || (statesShare(quote, p) && squash(quote).includes(squash(name)));
  };
  const rf = file.entity.registry_filed;
  if (rf?.quote && squash(rf.quote) && !statesDate(rf.quote, rf.value))
    ev.say("quote", `The quote "${rf.quote}" doesn't state the date ${rf.value}.`, `${file.entity.name}'s latest registry filing`);
  const walk = (hs: HolderEvidence[], seen: Set<HolderEvidence>) => {
    for (const h of hs) if (!seen.has(h)) {
      if (!states(h.quote, h.name, h.pct)) ev.say("quote", `The quote "${h.quote}" doesn't state ${h.name}'s ${h.pct}%.`, `${h.name}'s ${h.pct}%`);
      walk(h.owners ?? [], new Set([...seen, h]));
    }
  };
  walk(file.ownership?.holders ?? [], new Set());
  for (const o of file.certification?.owners ?? [])
    if (!states(o.quote, o.name, o.pct)) ev.say("quote", `The quote "${o.quote}" doesn't state ${o.name}'s ${o.pct}%.`, `the certification's line for ${o.name}`);
}
