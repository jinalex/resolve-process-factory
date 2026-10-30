// A mock of the evidence system for KYB cases (DECISIONS.md, "The evidence boundary"). It answers one request at a
// time from a case's raw facts, the way the real system would answer from documents and vendors, and keeps a log
// of what was asked. Both arms of the comparison (agentic review, and agentic review + Resolve) ask the same mock,
// so they see the same evidence and only the decision layer differs.
//
// What's asked is what's known: the case file Resolve evaluates is built only from answers the agent requested.
// A company's owners need their own request, as a certification would; a check that hasn't come back is unknown.
import type { Holder } from "./ownership.ts";
import { type KybFacts, type Person, evaluateIdentified } from "./facts.ts";
import type { Spec } from "../../core/spec.ts";
import { pendingFacts } from "../../core/evidence.ts";
import type { CaseWorld, Check } from "../../runner/agent.ts";

const ENTITY_FIELDS = ["country", "excluded", "nonprofit", "industry", "licence_verified", "registry_filed", "sanctions", "adverse_media"] as const;
const PERSON_FIELDS = ["residence", "nationality", "id_verified", "sanctions", "pep", "adverse_media"] as const;
type EntityField = (typeof ENTITY_FIELDS)[number];
type PersonField = (typeof PERSON_FIELDS)[number];

export type Answer = { request: string; value: unknown; source: string };

// What the agent is told about how to ask. Kept here so the grammar and its parser stay together.
const REQUESTS = `Requests, one string each:
- "entity.<field>": the applicant's ${ENTITY_FIELDS.join(", ")}. sanctions is none, potential or confirmed; adverse_media is yes or no; country is an ISO code; registry_filed is the date of the latest registry filing.
- "ownership": the applicant's direct holders (name, type, pct). A holder of type entity lists no owners here; ask for them separately.
- "ownership_of:<company name>": the owners of a company that holds part of the applicant, as its certification states them.
- "control_person": the individual named as the control person, and the basis.
- "certification": the owners the customer certifies, with their shares.
- "person:<full name>.<field>": an individual's ${PERSON_FIELDS.join(", ")}. sanctions is none, potential or confirmed; pep, adverse_media and id_verified are yes or no; residence and nationality are ISO codes.
An answer of "unknown" means the fact isn't established yet (for example, a vendor check that hasn't come back).`;

// A request as the log keeps it: names trimmed, so "person: Dana Ruiz .pep" is the same request as
// "person:Dana Ruiz.pep" and the case file rebuilt from the log finds the same person.
const canonical = (r: string) => {
  const t = r.trim();
  const p = /^person:(.+)\.(\w+)$/.exec(t);
  if (p) return `person:${p[1].trim()}.${p[2]}`;
  const o = /^ownership_of:(.+)$/.exec(t);
  return o ? `ownership_of:${o[1].trim()}` : t;
};
const known = (v: unknown) => v !== undefined && v !== null && v !== "unknown";
const show = (v: unknown) => (known(v) ? (v === true ? "yes" : v === false ? "no" : v) : "unknown");

export class KybEvidence {
  readonly log: Answer[] = [];
  private readonly facts: KybFacts;
  private readonly id: string;
  constructor(caseId: string, facts: KybFacts) {
    this.id = caseId; this.facts = facts;
    // The mock finds people and companies by name, so two of either under one name would answer for each other.
    // A company that turns up again inside its own chain is the same company (a loop), not a second one.
    const people = (facts.people ?? []).map((p) => p.name);
    const twice = people.find((n, i) => people.indexOf(n) !== i);
    if (twice !== undefined) throw new Error(`${caseId}: two people named "${twice}"; the mock finds people by name`);
    const firsts: string[] = [];
    const walk = (hs: Holder[], above: string[]) => { for (const h of hs) {
      if (h.type !== "entity" || !h.name) continue;
      if (above.includes(h.name)) continue;
      if (firsts.includes(h.name)) throw new Error(`${caseId}: two companies named "${h.name}"; the mock finds companies by name`);
      firsts.push(h.name);
      walk(h.owners ?? [], [...above, h.name]);
    } };
    walk(facts.ownership ?? [], []);
  }

  private entity(field: EntityField): unknown {
    const e = this.facts.entity ?? {};
    return field === "sanctions" || field === "adverse_media" ? e.screening?.[field] : e[field];
  }
  // A company's owners, wherever it sits in the chain. undefined when no company of that name holds a share.
  private ownersOf(name: string, hs: Holder[] = this.facts.ownership ?? []): Holder[] | null | undefined {
    for (const h of hs) {
      if (h.type === "entity" && h.name === name) return h.owners ?? null;
      const deeper = h.owners ? this.ownersOf(name, h.owners) : undefined;
      if (deeper !== undefined) return deeper;
    }
    return undefined;
  }
  private person(name: string): Person | undefined { return (this.facts.people ?? []).find((p) => p.name === name); }

  private answer(request: string): { value: unknown; source: string } {
    const src = (what: string) => `mock:${this.id}/${what}`;
    const m = /^entity\.(\w+)$/.exec(request);
    if (m && (ENTITY_FIELDS as readonly string[]).includes(m[1])) return { value: show(this.entity(m[1] as EntityField)), source: src(request) };
    if (request === "ownership") {
      const own = this.facts.ownership;
      return { value: own ? own.map(({ name, type, pct }) => ({ name, type, pct })) : "unknown", source: src(request) };
    }
    const o = /^ownership_of:(.+)$/.exec(request);
    if (o) {
      const owners = this.ownersOf(o[1]);
      if (owners === undefined) return { value: `no company named "${o[1]}" holds a share`, source: src(request) };
      return { value: owners ? owners.map(({ name, type, pct }) => ({ name, type, pct })) : "unknown", source: src(request) };
    }
    if (request === "control_person") {
      const c = this.facts.control_person;
      return { value: c === undefined ? "unknown" : c, source: src(request) };
    }
    // No certification in the facts means none is on file, which the evaluator reads as unknown, as it reads the raw facts.
    if (request === "certification") return { value: this.facts.certification ?? "unknown", source: src(request) };
    const p = /^person:(.+)\.(\w+)$/.exec(request);
    if (p && (PERSON_FIELDS as readonly string[]).includes(p[2])) {
      const who = this.person(p[1]);
      return { value: who ? show(who[p[2] as PersonField]) : "unknown", source: src(request) };
    }
    return { value: `not a request this system answers; see the request list`, source: src("invalid") };
  }

  get(requests: string[]): Answer[] {
    const out = requests.map((r) => { const req = canonical(r); return { request: req, ...this.answer(req) }; });
    this.log.push(...out);
    return out;
  }

  // Everything the mock can say about the case, as the decision-only level hands it over up front.
  all(): Answer[] {
    const reqs: string[] = [...ENTITY_FIELDS.map((f) => `entity.${f}`), "ownership", "control_person", "certification"];
    const companies = (hs: Holder[] = []): string[] => hs.flatMap((h) => (h.type === "entity" && h.name ? [h.name, ...companies(h.owners ?? [])] : []));
    reqs.push(...companies(this.facts.ownership ?? []).map((n) => `ownership_of:${n}`));
    for (const p of this.facts.people ?? []) reqs.push(...PERSON_FIELDS.map((f) => `person:${p.name}.${f}`));
    return this.get(reqs);
  }

  // The case file Resolve evaluates: only what was asked for and answered. Anything never asked stays missing,
  // so Resolve reads it as unknown. A company whose owners were never asked for has unknown owners.
  caseFile(reviewDate: string): KybFacts {
    const got = new Map(this.log.filter((a) => a.source !== `mock:${this.id}/invalid`).map((a) => [a.request, a.value]));
    const val = (k: string) => { const v = got.get(k); return v === undefined || v === "unknown" ? undefined : v; };
    const entity: KybFacts["entity"] = {
      country: val("entity.country") as string, excluded: val("entity.excluded") as string, nonprofit: val("entity.nonprofit") as string,
      industry: val("entity.industry") as string, licence_verified: val("entity.licence_verified") as string,
      registry_filed: val("entity.registry_filed") as string,
      screening: { sanctions: val("entity.sanctions") as string, adverse_media: val("entity.adverse_media") as string },
    };
    // A company that turns up again inside its own chain is a loop: its owners there stay unknown, as in the facts.
    const withOwners = (hs: Holder[], above: string[] = []): Holder[] => hs.map((h) => {
      if (h.type !== "entity") return { ...h };
      const owners = h.name && !above.includes(h.name) ? val(`ownership_of:${h.name}`) as Holder[] | undefined : undefined;
      return { ...h, owners: owners ? withOwners(owners, [...above, h.name!]) : null };
    });
    const own = val("ownership") as Holder[] | undefined;
    const names = new Set([...got.keys()].flatMap((k) => { const p = /^person:(.+)\.\w+$/.exec(k); return p ? [p[1]] : []; }));
    const people: Person[] = [...names].map((name) => Object.fromEntries([["name", name],
      ...PERSON_FIELDS.map((f) => [f, val(`person:${name}.${f}`)])]) as Person);
    const cp = got.get("control_person");
    return {
      review_date: reviewDate, entity,
      ownership: own ? withOwners(own) : undefined,
      control_person: cp === undefined || cp === "unknown" ? undefined : cp as KybFacts["control_person"],
      people,
      // A certification never read is left out, and the facts read it as unknown, not empty (2.2).
      certification: val("certification") as KybFacts["certification"],
    };
  }
}

// A KYB case as the case runner sees it: the mock to ask, and Resolve's check on what has been gathered.
export class KybWorld implements CaseWorld {
  readonly requests = REQUESTS;
  readonly outcomes: string[];
  readonly evidence: KybEvidence;
  readonly id: string;
  readonly reviewDate: string;
  private readonly spec: Spec;
  constructor(id: string, facts: KybFacts, spec: Spec) {
    this.id = id; this.spec = spec; this.reviewDate = facts.review_date;
    this.evidence = new KybEvidence(id, facts); this.outcomes = spec.order;
  }
  get(requests: string[]) { return this.evidence.get(requests); }
  all() { return this.evidence.all(); }
  check(): Check {
    const r = evaluateIdentified(this.spec, this.evidence.caseFile(this.reviewDate));
    return { outcome: r.outcome, decided_by: r.decided_by.map((h) => ({ sop: h.sop, rule: h.rule })), still_needed: pendingFacts(r), notes: r.notes };
  }
}
