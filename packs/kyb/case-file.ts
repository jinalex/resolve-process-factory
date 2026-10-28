// The KYB agent's case file (review doc section 1) and Resolve's checks on it (section 5).
// The agent writes raw evidence: each fact with its value, where it came from and the exact words.
// The general checks (quotes, vendor fields, the outcome) are in core/evidence.ts; this file adds KYB's own:
// the control person's reasons, everyone 25% or more identified, 4.4's bar for web evidence, the certification.
import { type Fact, type Documents, EvidenceCheck, type Problem, pendingFacts, squash } from "../../core/evidence.ts";
import type { Outcome, Spec } from "../../core/spec.ts";
import { type KybFacts, type Person, evaluateKyb, ownersToIdentify } from "./facts.ts";
import { ownership } from "./ownership.ts";
import { type Frac, cmp, fromPercent, toPercent } from "../../core/frac.ts";

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

// A share as the file writes it, or null if it isn't a percentage ("25%", "majority").
function share(pct: number | string): Frac | null {
  try { return fromPercent(pct); } catch { return null; }
}

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

export function checkCase(spec: Spec, file: CaseFile, docs: Documents): Check {
  // Web results come from the news corpus the agent searched. A fact cited to "web" must quote one of the results
  // the file lists. The corpus, not the file, says who published a result and how strong a source it is.
  const corpus = docs.json("news.json") as { results?: Partial<WebHit & { text: string }>[] } | undefined;
  const result = (url: string) => (corpus?.results ?? []).find((x) => x.url === url);
  const web = file.web ?? [], people_ = file.people ?? [];
  const cited = web.map((h) => result(h.url)?.text).filter((t) => typeof t === "string");
  const ev = new EvidenceCheck(docs, fieldSays, new Map([["web", cited]]));
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
    sanctions: checkFact(e.screening?.sanctions, `sanctions screening for ${e.name}`, "sanctions", e.name),
    adverse_media: checkFact(e.screening?.adverse_media, `adverse media for ${e.name}`, "adverse_media", e.name),
  };
  const licence = e.licence_verified ? checkFact(e.licence_verified, `whether ${e.name}'s licence is verified`, "licence_verified", e.name) : "unknown";

  // Each holder's share is quoted, and the tree is walked once per company: a company that owns itself, directly
  // or through others, is a loop ownership.ts reports, not a crash.
  let unreadable = false;
  const holders = (hs: HolderEvidence[], seen: Set<HolderEvidence>): KybFacts["ownership"] => hs.filter((h) => !seen.has(h)).map((h) => {
    quoteFound(h, `${h.name ?? "an unnamed holder"}'s ${h.pct}%`, true);
    if (!share(h.pct)) { unreadable = true; say("missing", `${h.name ?? "An unnamed holder"}'s share is written "${h.pct}", which isn't a percentage.`, `${h.name}'s share`); }
    if (h.owners_source) quoteFound(h.owners_source, `who owns ${h.name}`, true);
    return { name: h.name, type: h.type, pct: h.pct, owners: h.owners ? holders(h.owners, new Set([...seen, h])) : h.owners };
  });
  const read = file.ownership ? holders(file.ownership.holders ?? [], new Set()) : null;
  const tree = unreadable ? null : read;   // a share that can't be read leaves ownership unknown

  // Nationality isn't in any rule; it's checked when the file gives it.
  const people: Person[] = people_.map((p) => ({
    name: p.name,
    residence: checkFact(p.residence, `where ${p.name} lives`, "residence", p.name),
    nationality: p.nationality ? checkFact(p.nationality, `${p.name}'s nationality`, "nationality", p.name) : "unknown",
    id_verified: checkFact(p.id_verified, `${p.name}'s ID check`, "id_verified", p.name),
    sanctions: checkFact(p.sanctions, `sanctions screening for ${p.name}`, "sanctions", p.name),
    pep: checkFact(p.pep, `PEP screening for ${p.name}`, "pep", p.name),
    adverse_media: checkFact(p.adverse_media, `adverse media for ${p.name}`, "adverse_media", p.name),
  }));

  // 2. The judgment calls carry reasons that meet the SOP. Control person (3.2): a role FinCEN lists, quoted with the
  // person's name and that title, or a quote about what the person does, which is the agent's reading and goes to a
  // person to confirm. Without either, the control person isn't identified.
  let controlPerson = file.control_person;
  if (controlPerson) {
    const cp = controlPerson, has = (r: Reason, words: string) => squash(r.quote ?? "").includes(squash(words));
    const quoted = (cp.reasons ?? []).filter((r) => quoteFound(r, `the reason ${cp.name} is the control person`, true));
    const roles = quoted.filter((r) => r.kind === "role" && typeof r.title === "string" && has(r, r.title) && has(r, cp.name) &&
      CONTROL_ROLES.some((role) => r.title.toLowerCase().includes(role)));
    const functions = quoted.filter((r) => r.kind === "function");
    if (!roles.length && functions.length)
      flags.push(`${cp.name} is the control person on the agent's reading of what ${cp.name} does ("${functions[0].quote}"). A person should confirm it meets 3.2.`);
    if (!roles.length && !functions.length) {
      say("judgment", `${cp.name} was named control person, but the file cites neither a role FinCEN lists, quoted with ${cp.name}'s name, nor a quote showing ${cp.name} directs the business, so 3.2 isn't met. A person should confirm.`, "control_person");
      controlPerson = null;
    }
  }

  // 3. Everyone the SOP needs is identified and screened: whoever the spec's 3.2 and 3.3 count (the control person,
  // each owner who owns or could own 25% or more, anyone the customer certifies at 25% or more) is in the file's people list.
  const own = tree ? ownership(tree) : null;
  const certified = new Map<string, Frac>();
  for (const o of file.certification?.owners ?? []) {
    const c = share(o.pct);
    if (c) certified.set(o.name, c);
    else say("missing", `The certification gives ${o.name}'s share as "${o.pct}", which isn't a percentage.`, `the certification's line for ${o.name}`);
  }
  // Whether a name is a company somewhere in the tree, for the certification check in section 5.
  const company = (name: string, hs: HolderEvidence[] = file.ownership?.holders ?? [], seen = new Set<HolderEvidence>()): boolean =>
    hs.some((h) => !seen.has(h) && ((h.name === name && h.type !== "person") || company(name, h.owners ?? [], new Set([...seen, h]))));
  const facts: KybFacts = {
    review_date: file.review_date,
    entity: { country: ent.country, excluded: ent.excluded, nonprofit: ent.nonprofit, industry: ent.industry, licence_verified: licence,
              registry_filed: ent.registry_filed === "unknown" ? null : ent.registry_filed, screening: { sanctions: ent.sanctions, adverse_media: ent.adverse_media } },
    ownership: tree, control_person: controlPerson ? { name: controlPerson.name } : null, people,
    certification: file.certification ? [...certified].map(([name, c]) => ({ name, pct: toPercent(c, 10) })) : null,
  };
  const r = evaluateKyb(spec, facts);
  for (const [n, counts] of Object.entries(r.counts.people ?? {})) if (counts === "yes" && !people_.some((p) => p.name === n)) {
    const s = own?.people.get(n) ?? certified.get(n);
    say("people", `${n} ${s ? `owns ${toPercent(s)}%` : "is the control person"} but has no ID check or screening in the file.`, n);
  }

  // 4. Web evidence meets 4.4's bar, and every search is recorded. Who published a result, and how strong a source it
  // is, come from the corpus; one URL is one source however many times the file lists it. Adverse media that rests
  // on anything but a vendor result has to meet the bar. Whether a report that meets it is material is for a person
  // (PLANTED.md, 4.4), so a file that calls it not adverse is flagged, not failed.
  const strong = (h: WebHit) => ["court", "regulator", "established"].includes(h.tier);
  const counts = (hits: WebHit[]) => hits.filter((h) => (h.matched ?? []).includes("name") && (h.matched ?? []).some((m) => m !== "name"));
  for (const subject of [e.name, ...people_.map((p) => p.name)]) {
    const listed = web.filter((h) => h.about === subject);
    const hits: WebHit[] = [];
    for (const h of listed) {
      const found = result(h.url);
      if (!found) { say("quote", `The web result ${h.url} isn't among the search results the agent saw.`, `adverse media for ${subject}`); continue; }
      if (!squash(h.quote ?? "") || !squash(found.text ?? "").includes(squash(h.quote))) { say("quote", `The quote "${h.quote}" isn't in ${h.url}.`, `adverse media for ${subject}`); continue; }
      if (!hits.some((x) => x.url === h.url)) hits.push({ ...h, publisher: found.publisher ?? h.url, tier: found.tier ?? "other" });
    }
    const good = counts(hits);
    const qualifies = good.some(strong) || new Set(good.map((h) => h.publisher)).size >= 2;
    const fact = subject === e.name ? e.screening?.adverse_media : people_.find((p) => p.name === subject)?.adverse_media;
    const said = subject === e.name ? ent.adverse_media : people.find((p) => p.name === subject)?.adverse_media;
    const fromWeb = !!fact && !fact.field;
    if (fact?.source === "web" && fact.quote && !hits.some((h) => squash(result(h.url)?.text ?? "").includes(squash(fact.quote!))))
      say("quote", `Adverse media for ${subject} quotes a web result that isn't one of the results recorded about ${subject}.`, `adverse media for ${subject}`);
    if (said === "yes" && fromWeb && !qualifies)
      say("web", `Adverse media for ${subject} rests on ${hits.length ? hits.map((h) => `${h.publisher} (matched ${h.matched.join(" and ")})`).join(", ") : "nothing recorded"}. 4.4 needs the name plus another identifier, from a court, regulator or established outlet, or from two independent sources.`, `adverse media for ${subject}`);
    if (said !== "yes" && qualifies)
      flags.push(`${good.filter(strong).map((h) => h.publisher).join(", ") || "Two independent sources"} report on ${subject}, matching name and another identifier, and the file says there is no adverse media. A person should confirm the reports aren't material (4.4).`);
    const search = (file.searches ?? []).find((x) => x.subject === subject);
    if (!search)
      say("missing", `No adverse media search is recorded for ${subject.replace(/\.$/, "")}. 4.4 needs the terms, the date and the sources reviewed.`, `adverse media for ${subject}`);
    else if (!search.terms?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(search.date ?? "") || !search.sources?.length)
      say("missing", `The adverse media search for ${subject.replace(/\.$/, "")} doesn't record its terms, its date (YYYY-MM-DD) and the sources reviewed, which 4.4 needs.`, `adverse media for ${subject}`);
  }

  // 5. The customer's certification matches the ownership the file found.
  if (file.certification) {
    for (const o of file.certification.owners ?? []) quoteFound({ source: file.certification.source, quote: o.quote }, `the certification's line for ${o.name}`, true);
    const toIdentify = ownersToIdentify(spec, facts);
    for (const [name, s] of own?.people ?? []) {
      const c = certified.get(name);
      if (toIdentify.includes(name) && !c) flags.push(`${name} owns ${toPercent(s)}% but isn't on the customer's certification.`);
      else if (c && cmp(c, s) !== 0) flags.push(`The certification says ${name} owns ${toPercent(c)}%, but the file works out ${toPercent(s)}%.`);
    }
    for (const [name] of certified) if (!own?.people.has(name)) {
      flags.push(company(name) ? `The certification lists ${name}, a company, where it asks for individuals.` : `The certification lists ${name}, who isn't among the owners the file found.`);
    }
  }

  // 6. The outcome follows from the facts under the spec.
  ev.outcome(file.outcome, r);

  // What's still needed, in plain sentences, from the rules that applied.
  const applied = (rule: string) => r.applied.some((h) => h.rule === rule);
  if (own && applied("ownership-over-100")) missing.push(`Correct the ownership table: ${own.overAllocated.join("; ")} (3.3).`);
  if (own && applied("ownership-complete")) {
    const gaps: string[] = [], walk = (hs: HolderEvidence[], seen: Set<HolderEvidence>) => {
      for (const h of hs) if (!seen.has(h)) {
        if (h.type === "unknown" || !h.name) gaps.push(`who holds ${h.pct}% (${h.quote})`);
        else if (h.type === "entity" && !h.owners) gaps.push(`the owners of ${h.name} (holds ${h.pct}%)`);
        walk(h.owners ?? [], new Set([...seen, h]));
      }
    };
    walk(file.ownership?.holders ?? [], new Set());
    missing.push(`Find ${gaps.join(" and ") || "the remaining owners"}. ${toPercent(own.unaccounted)}% is unaccounted for, so someone unidentified could own 25% or more (3.3).`);
  }
  if (applied("registry-fresh"))
    missing.push(`Get a current registry filing. The latest is ${r.computed.registry_age_months} months old, and 3.5 needs under 12.`);
  missing.push(...pendingFacts(r));
  for (const p of people) if (p.id_verified === "no") missing.push(`Verify ${p.name}'s identity (3.4).`);

  return { passed: problems.length === 0, problems, flags, missing: [...new Set(missing)], outcome: r.outcome,
           decided_by: r.decided_by.map((h) => h.rule), notes: r.notes };
}

