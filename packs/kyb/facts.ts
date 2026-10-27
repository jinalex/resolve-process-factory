// KYB's raw facts, and how they become a case the general evaluator can run: the entity's facts become case
// facts, the identified individuals become the "people" list, and three facts are computed here (ownership
// completeness, the registry filing's age, whether a control person is named).
import { type Case, type Result, type Value, evaluate } from "../../core/evaluate.ts";
import type { Spec } from "../../core/spec.ts";
import { type Holder, ownership } from "./ownership.ts";
import { toPercent } from "./frac.ts";

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

export function monthsBetween(from: string, to: string) {
  const a = new Date(from), b = new Date(to);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

export function toCase(c: KybFacts): { case: Case; details: KybDetails } {
  const e = c.entity ?? {};
  const own = c.ownership ? ownership(c.ownership) : null;
  const ownership_complete: Tri = !own || own.overAllocated.length ? "unknown" : own.complete ? "yes" : "no";
  const registry_age_months = e.registry_filed ? monthsBetween(e.registry_filed, c.review_date) : null;
  const control_person_identified: Tri = c.control_person?.name ? "yes" : c.control_person === null ? "no" : "unknown";
  return {
    case: {
      facts: { excluded: e.excluded, nonprofit: e.nonprofit, industry: e.industry, licence_verified: e.licence_verified, country: e.country,
               entity_sanctions: e.screening?.sanctions, entity_adverse_media: e.screening?.adverse_media },
      items: { people: c.people ?? [] },
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
