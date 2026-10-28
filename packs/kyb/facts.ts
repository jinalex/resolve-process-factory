// KYB's raw facts, and how they become a case the general evaluator can run: the entity's facts become case
// facts, the identified individuals become the "people" list, and three facts are computed here (ownership
// completeness, the registry filing's age, whether a control person is named). Industries and countries are
// mapped onto the spec's values here; anything that doesn't map stays as written, and the evaluator reads it as unknown.
import { type Case, type Result, type Value, evaluate } from "../../core/evaluate.ts";
import type { Spec } from "../../core/spec.ts";
import { type Holder, ownership } from "./ownership.ts";
import { ZERO, add, cmp, frac, toPercent } from "./frac.ts";

const QUARTER = frac(1n, 4n);

type Tri = "yes" | "no" | "unknown";

export type Person = { name: string; residence?: string; nationality?: string; id_verified?: Value;
                       sanctions?: Value; pep?: Value; adverse_media?: Value };
export type KybFacts = {
  review_date: string;
  entity: { country?: string; excluded?: Value; nonprofit?: Value; industry?: string; licence_verified?: Value;
            registry_filed?: string | null; screening?: { sanctions?: Value; adverse_media?: Value } };
  ownership?: Holder[] | null;          // null or missing: nobody has established who owns the entity
  control_person?: { name: string; basis?: string } | null;
  people?: Person[] | null;             // every identified individual: owners of 25% or more and the control person
};

export type KybDetails = { ownership_complete: Tri; unaccounted_pct: number | null; registry_age_months: number | null;
                           control_person_identified: Tri; people_pct: Record<string, number>; trusts: string[]; loops: string[] };

// Countries are ISO 3166 codes ("IR", or "RU-CRIMEA" for a region), in any case. Anything else, like "Iran", is
// unknown, so a name never slips past the sanctioned-country lists.
const isoCode = (v: string | undefined) => {
  const code = v?.trim().toUpperCase();
  return code === undefined || /^[A-Z]{2}(-[A-Z]+)?$/.test(code) ? code : undefined;
};

// The SOP's own words for its industries (5.1, 5.2), as the spec's values.
const INDUSTRIES: Record<string, string> = {
  "marijuana-related business": "prohibited", "adult content": "prohibited", "unlicensed money transmission": "prohibited",
  "money services business": "msb", "virtual currency": "crypto",
};
const industry = (v: string | undefined) => (v === undefined ? v : INDUSTRIES[v.trim().toLowerCase()] ?? v);

// Whole months from one date to another; null if either date can't be read.
export function monthsBetween(from: string, to: string) {
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

export function toCase(c: KybFacts): { case: Case; details: KybDetails } {
  const e = c.entity ?? {};
  const own = c.ownership ? ownership(c.ownership) : null;
  // A table listing over 100% counts as incomplete ownership, so 3.3 asks for documents (Alex, 2026-10-28).
  const ownership_complete: Tri = !own ? "unknown" : own.complete ? "yes" : "no";
  const registry_age_months = e.registry_filed ? monthsBetween(e.registry_filed, c.review_date) : null;
  const control_person_identified: Tri = c.control_person?.name ? "yes" : c.control_person === null ? "no" : "unknown";
  // Everyone the SOP must screen: the control person, and each named owner who owns, or with the unaccounted
  // shares could own, 25% or more. Anyone missing from the people list is added with every fact unknown,
  // so their screening is pending rather than skipped.
  const people: Person[] = [...(c.people ?? [])];
  const spare = own && cmp(own.unaccounted, ZERO) > 0 ? own.unaccounted : ZERO;
  const needed = [...(own?.people ?? [])].filter(([, share]) => cmp(add(share, spare), QUARTER) >= 0).map(([name]) => name);
  if (c.control_person?.name) needed.push(c.control_person.name);
  for (const name of needed) if (!people.some((p) => p.name === name)) people.push({ name });
  return {
    case: {
      facts: {
        excluded: e.excluded, nonprofit: e.nonprofit, industry: industry(e.industry), licence_verified: e.licence_verified,
        country: isoCode(e.country), entity_sanctions: e.screening?.sanctions, entity_adverse_media: e.screening?.adverse_media,
      },
      items: { people: people.map((p) => ({ ...p, residence: isoCode(p.residence) })) },
      computed: { ownership_complete, control_person_identified, registry_age_months },
    },
    details: {
      ownership_complete, unaccounted_pct: own ? toPercent(own.unaccounted) : null, registry_age_months, control_person_identified,
      people_pct: Object.fromEntries([...(own?.people ?? new Map())].map(([k, v]) => [k, toPercent(v)])),
      trusts: (own?.trusts ?? []).map((t) => `${t.name ?? "unnamed trust"} (${toPercent(t.share)}%)`), loops: own?.loops ?? [],
    },
  };
}

// The general evaluator on a KYB case, plus KYB's own details and a note when ownership loops back on itself.
export function evaluateKyb(spec: Spec, c: KybFacts): Result & { computed: KybDetails } {
  const { case: kase, details } = toCase(c);
  const r = evaluate(spec, kase);
  if (details.loops.length) r.notes.push(`Ownership loops back on itself (${details.loops.join("; ")}); a person should look at it.`);
  return { ...r, computed: details };
}
