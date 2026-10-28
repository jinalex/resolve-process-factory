// The KYB agent's case file (review doc section 1) and Resolve's checks on it (section 5).
// The agent writes raw evidence: each fact with its value, where it came from and the exact words.
// The general checks (quotes, vendor fields, the outcome) are in core/evidence.ts; this file adds KYB's own:
// the control person's reasons, everyone 25% or more identified, 4.4's bar for web evidence, the certification.
import { type Fact, type Documents, EvidenceCheck, type Problem, pendingFacts, squash } from "../../core/evidence.ts";
import type { Outcome, Spec } from "../../core/spec.ts";
import { type KybFacts, type Person, evaluateKyb } from "./facts.ts";
import { ownership } from "./ownership.ts";
import { type Frac, ZERO, add, cmp, frac, fromPercent, toPercent } from "./frac.ts";

export { Documents } from "../../core/evidence.ts";
export type { Evidence, Fact } from "../../core/evidence.ts";

export type HolderEvidence = {
  name: string | null; type: "person" | "entity" | "excluded_entity" | "trust" | "unknown"; pct: number | string;
  source: string; quote: string;
  owners?: HolderEvidence[] | null;     // a company's own owners; null when the agent hasn't found them
  owners_source?: { source: string; quote: string };
};
export type Reason = { kind: "role"; title: string; source: string; quote: string } | { kind: "function"; source: string; quote: string };
export type WebHit = { about: string; url: string; publisher: string; date: string; tier: "court" | "regulator" | "established" | "other";
                       matched: ("name" | "age" | "location" | "role")[]; quote: string };
export type Search = { subject: string; terms: string; date: string; sources: string[] };

export type PersonEvidence = {
  name: string; residence?: Fact; nationality?: Fact; id_verified?: Fact; sanctions?: Fact; pep?: Fact; adverse_media?: Fact;
};
export type CaseFile = {
  case_id: string;
  review_date: string;
  entity: { name: string; country?: Fact; excluded?: Fact; nonprofit?: Fact; industry?: Fact; licence_verified?: Fact;
            registry_filed?: Fact; screening?: { sanctions?: Fact; adverse_media?: Fact } };
  ownership: { holders: HolderEvidence[] } | null;   // null for an excluded entity or a nonprofit
  certification?: { source: string; owners: { name: string; pct: number | string; quote: string }[] } | null;
  control_person: { name: string; reasons: Reason[] } | null;
  people: PersonEvidence[];
  web?: WebHit[];
  searches?: Search[];
  outcome: Outcome;
  reason: string;
};

export type { Problem };
export type Check = {
  passed: boolean;           // the file is consistent: real evidence, nothing required left out, the outcome follows
  problems: Problem[];       // why not, in plain sentences
  flags: string[];           // for a person to look at, without failing the file: documents that disagree
  missing: string[];         // what's still needed to finish the case
  outcome: Outcome;          // the outcome the spec gives on this file's facts
  decided_by: string[];
  notes: string[];
};

// FinCEN's examples of a control person (31 CFR 1010.230(d)(2)). A quote showing the person does similar work counts too.
const CONTROL_ROLES = ["chief executive officer", "chief financial officer", "chief operating officer", "managing member",
  "general partner", "president", "vice president", "treasurer"];

const QUARTER = frac(1n, 4n);

// A share as the file writes it, or null if it isn't a percentage ("25%", "majority").
function share(pct: number | string): Frac | null {
  try { return fromPercent(pct); } catch { return null; }
}

// What a vendor result's field says, for the fields we know how to read. undefined means "can't tell".
export function fieldSays(key: string, raw: unknown): string | string[] | undefined {
  if (key === "id_verified") return raw === "approved" ? "yes" : raw === "declined" ? "no" : "unknown";
  if (["sanctions", "pep", "adverse_media"].includes(key)) {
    if (raw === null) return "unknown";
    if (!Array.isArray(raw)) return undefined;
    if (raw.length === 0) return key === "sanctions" ? "none" : "no";
    return key === "sanctions" ? ["potential", "confirmed"] : "yes"; // which of the two is for a person to decide
  }
  if (key === "licence_verified" && Array.isArray(raw)) {
    const active = (l: { status?: string; authorized_to_conduct_business?: boolean }) => l.status === "Approved" && l.authorized_to_conduct_business === true;
    return raw.some(active) ? "yes" : "no";
  }
  return undefined;
}

export function checkCase(spec: Spec, file: CaseFile, docs: Documents): Check {
  // Web results come from the news corpus the agent searched. A fact cited to "web" must quote one of the results
  // the file lists.
  const corpus = docs.json("news.json") as { results?: { url: string; text: string }[] } | undefined;
  const cited = (file.web ?? []).map((h) => corpus?.results?.find((x) => x.url === h.url)?.text).filter((t) => t !== undefined);
  const ev = new EvidenceCheck(docs, fieldSays, { web: cited.join("\n\n") });
  const { problems, flags } = ev, missing: string[] = [];
  const say = ev.say.bind(ev);

  // 1. The evidence is really in the cited document (core/evidence.ts).
  const quoteFound = ev.quote.bind(ev), checkFact = ev.fact.bind(ev);

  const e = file.entity;
  const ent = {
    country: checkFact(e.country, `${e.name}'s country`, "country"),
    excluded: checkFact(e.excluded, `whether ${e.name} is an excluded entity`, "excluded"),
    nonprofit: checkFact(e.nonprofit, `whether ${e.name} is a nonprofit`, "nonprofit"),
    industry: checkFact(e.industry, `${e.name}'s industry`, "industry"),
    registry_filed: checkFact(e.registry_filed, `${e.name}'s latest registry filing`, "registry_filed"),
    sanctions: checkFact(e.screening?.sanctions, `sanctions screening for ${e.name}`, "sanctions"),
    adverse_media: checkFact(e.screening?.adverse_media, `adverse media for ${e.name}`, "adverse_media"),
  };
  const licence = e.licence_verified ? checkFact(e.licence_verified, `whether ${e.name}'s licence is verified`, "licence_verified") : "unknown";

  let unreadable = false;
  const holders = (hs: HolderEvidence[]): KybFacts["ownership"] => hs.map((h) => {
    quoteFound(h, `${h.name ?? "an unnamed holder"}'s ${h.pct}%`);
    if (!share(h.pct)) { unreadable = true; say("missing", `${h.name ?? "An unnamed holder"}'s share is written "${h.pct}", which isn't a percentage.`, `${h.name}'s share`); }
    if (h.owners_source) quoteFound(h.owners_source, `who owns ${h.name}`);
    return { name: h.name, type: h.type, pct: h.pct, owners: h.owners ? holders(h.owners) : h.owners };
  });
  const read = file.ownership ? holders(file.ownership.holders) : null;
  const tree = unreadable ? null : read;   // a share that can't be read leaves ownership unknown

  const people: Person[] = file.people.map((p) => ({
    name: p.name,
    residence: checkFact(p.residence, `where ${p.name} lives`, "residence"),
    nationality: checkFact(p.nationality, `${p.name}'s nationality`, "nationality"),
    id_verified: checkFact(p.id_verified, `${p.name}'s ID check`, "id_verified"),
    sanctions: checkFact(p.sanctions, `sanctions screening for ${p.name}`, "sanctions"),
    pep: checkFact(p.pep, `PEP screening for ${p.name}`, "pep"),
    adverse_media: checkFact(p.adverse_media, `adverse media for ${p.name}`, "adverse_media"),
  }));

  // 2. The judgment calls carry reasons that meet the SOP. Control person (3.2): a FinCEN example role, or a quote
  // showing the person does similar work.
  if (file.control_person) {
    const cp = file.control_person;
    const ok = cp.reasons.filter((r) => quoteFound(r, `the reason ${cp.name} is the control person`) &&
      (r.kind === "function" || CONTROL_ROLES.some((role) => r.title.toLowerCase().includes(role))));
    if (!ok.length) say("judgment", `${cp.name} was named control person, but the file cites neither a role FinCEN lists nor a quote showing ${cp.name} directs the business, so 3.2 isn't met. A person should confirm.`, "control_person");
  }

  // 3. Everyone the SOP needs is identified and screened: each owner who owns, or with the unaccounted shares
  // could own, 25% or more (as facts.ts counts them), anyone the customer certifies at 25% or more, and the
  // control person.
  const own = tree ? ownership(tree) : null;
  const spare = own && cmp(own.unaccounted, ZERO) > 0 ? own.unaccounted : ZERO;
  const certified = new Map<string, Frac>();
  for (const o of file.certification?.owners ?? []) {
    const c = share(o.pct);
    if (c) certified.set(o.name, c);
    else say("missing", `The certification gives ${o.name}'s share as "${o.pct}", which isn't a percentage.`, `the certification's line for ${o.name}`);
  }
  const needed = new Set<string>();
  for (const [name, s] of own?.people ?? []) if (cmp(add(s, spare), QUARTER) >= 0) needed.add(name);
  // A company on the certification is flagged in section 5; only the individuals it lists need screening here.
  const company = (name: string, hs: HolderEvidence[] = file.ownership?.holders ?? []): boolean =>
    hs.some((h) => (h.name === name && h.type !== "person") || company(name, h.owners ?? []));
  for (const [name, c] of certified) if (cmp(c, QUARTER) >= 0 && !company(name)) needed.add(name);
  if (file.control_person) needed.add(file.control_person.name);
  for (const n of needed) if (!file.people.some((p) => p.name === n)) {
    const s = own?.people.get(n) ?? certified.get(n);
    say("people", `${n} ${s ? `owns ${toPercent(s)}%` : "is the control person"} but has no ID check or screening in the file.`, n);
  }

  // 4. Web evidence meets 4.4's bar, and every search is recorded.
  const strong = (h: WebHit) => ["court", "regulator", "established"].includes(h.tier);
  const counts = (hits: WebHit[]) => hits.filter((h) => h.matched.includes("name") && h.matched.some((m) => m !== "name"));
  for (const subject of [e.name, ...file.people.map((p) => p.name)]) {
    const hits = (file.web ?? []).filter((h) => h.about === subject);
    for (const h of hits) {
      // The quote must be in the result for that URL.
      const found = corpus?.results?.find((x) => x.url === h.url);
      if (!found) say("quote", `The web result ${h.url} isn't among the search results the agent saw.`, `adverse media for ${subject}`);
      else if (!squash(found.text).includes(squash(h.quote))) say("quote", `The quote "${h.quote}" isn't in ${h.url}.`, `adverse media for ${subject}`);
    }
    const good = counts(hits);
    const qualifies = good.some(strong) || new Set(good.map((h) => h.publisher)).size >= 2;
    const said = subject === e.name ? ent.adverse_media : people.find((p) => p.name === subject)?.adverse_media;
    const fromWeb = subject === e.name ? e.screening?.adverse_media?.source === "web" : file.people.find((p) => p.name === subject)?.adverse_media?.source === "web";
    if (said === "yes" && fromWeb && !qualifies)
      say("web", `Adverse media for ${subject} rests on ${hits.length ? hits.map((h) => `${h.publisher} (matched ${h.matched.join(" and ")})`).join(", ") : "nothing recorded"}. 4.4 needs the name plus another identifier, from a court, regulator or established outlet, or from two independent sources.`, `adverse media for ${subject}`);
    if (said === "no" && qualifies)
      say("web", `${good.filter(strong).map((h) => h.publisher).join(", ") || "Two independent sources"} report adverse media matching ${subject} on name and another identifier, but the file says there is none.`, `adverse media for ${subject}`);
    if (!(file.searches ?? []).some((s) => s.subject === subject))
      say("missing", `No adverse media search is recorded for ${subject.replace(/\.$/, "")}. 4.4 needs the terms, the date and the sources reviewed.`, `adverse media for ${subject}`);
  }

  // 5. The customer's certification matches the ownership the file found.
  if (file.certification) {
    for (const o of file.certification.owners) quoteFound({ source: file.certification.source, quote: o.quote }, `the certification's line for ${o.name}`);
    for (const [name, s] of own?.people ?? []) {
      const c = certified.get(name);
      if (cmp(s, QUARTER) >= 0 && !c) flags.push(`${name} owns ${toPercent(s)}% but isn't on the customer's certification.`);
      else if (c && cmp(c, s) !== 0) flags.push(`The certification says ${name} owns ${toPercent(c)}%, but the file works out ${toPercent(s)}%.`);
    }
    for (const [name] of certified) if (!own?.people.has(name)) {
      const h = file.ownership?.holders.find((x) => x.name === name);
      flags.push(h && h.type !== "person" ? `The certification lists ${name}, a company, where it asks for individuals.` : `The certification lists ${name}, who isn't among the owners the file found.`);
    }
  }

  // 6. The outcome follows from the facts under the spec.
  const facts: KybFacts = {
    review_date: file.review_date,
    entity: { country: ent.country, excluded: ent.excluded, nonprofit: ent.nonprofit, industry: ent.industry, licence_verified: licence,
              registry_filed: ent.registry_filed === "unknown" ? null : ent.registry_filed, screening: { sanctions: ent.sanctions, adverse_media: ent.adverse_media } },
    ownership: tree, control_person: file.control_person ? { name: file.control_person.name } : null, people,
  };
  const r = evaluateKyb(spec, facts);
  ev.outcome(file.outcome, r);

  // What's still needed, in plain sentences, from the facts as the file has them.
  if (own && r.computed.ownership_complete === "no" && ent.excluded !== "yes" && ent.nonprofit !== "yes") {
    const gaps = (file.ownership?.holders ?? []).filter((h) => h.type === "unknown" || !h.name || (h.type === "entity" && !h.owners)).map((h) =>
      h.type === "entity" ? `the owners of ${h.name} (holds ${h.pct}%)` : `who holds ${h.pct}% (${h.quote})`);
    missing.push(`Find ${gaps.join(" and ") || "the remaining owners"}. ${toPercent(own.unaccounted)}% is unaccounted for, so someone unidentified could own 25% or more (3.3).`);
  }
  if (r.computed.registry_age_months !== null && r.computed.registry_age_months >= 12)
    missing.push(`Get a current registry filing. The latest is ${r.computed.registry_age_months} months old, and 3.5 needs under 12.`);
  missing.push(...pendingFacts(r));
  for (const p of people) if (p.id_verified === "no") missing.push(`Verify ${p.name}'s identity (3.4).`);

  return { passed: problems.length === 0, problems, flags, missing: [...new Set(missing)], outcome: r.outcome,
           decided_by: r.decided_by.map((h) => h.rule), notes: r.notes };
}

