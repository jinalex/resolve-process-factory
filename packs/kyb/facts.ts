// KYB's raw facts, and how they become a case the general evaluator can run. This file only computes: who holds
// what share (ownership.ts), the registry filing's age, whether a control person is named. Who must be identified,
// when ownership is complete and what the case's words mean are the spec's to decide (spec/kyb-v1.json), so Z3
// checks them and a person can read them next to their SOP sentence. A value that doesn't map stays as written,
// and the evaluator reads it as unknown.
import { type Case, type Result, type Value, evaluate } from "../../core/evaluate.ts";
import type { Spec } from "../../core/spec.ts";
import { type Holder, ownership } from "./ownership.ts";
import { toPercent } from "../../core/frac.ts";

type Tri = "yes" | "no" | "unknown";

export type Person = { name: string; residence?: string; nationality?: string; id_verified?: Value;
                       sanctions?: Value; pep?: Value; adverse_media?: Value };
export type KybFacts = {
  review_date: string;
  entity: { country?: string; excluded?: Value; nonprofit?: Value; industry?: string; licence_verified?: Value;
            registry_filed?: string | null; screening?: { sanctions?: Value; adverse_media?: Value } };
  ownership?: Holder[] | null;          // null or missing: nobody has established who owns the entity
  control_person?: { name: string; basis?: string } | null;
  people?: Person[] | null;             // the individuals the agent identified and screened
  certification?: { name: string; pct: number }[] | null; // the owners the customer certifies, with their shares
};

export type KybDetails = { unaccounted_pct: number | null; registry_age_months: number | null; control_person_identified: Tri;
                           people_pct: Record<string, number>; trusts: string[]; loops: string[]; over_allocated: string[] };

// Countries are ISO 3166 codes ("IR", or "RU-CRIMEA" for a region), in any case. Anything else, like "Iran", is
// unknown, so a name never slips past the sanctioned-country lists.
const isoCode = (v: string | undefined) => {
  const code = v?.trim().toUpperCase();
  return code === undefined || /^[A-Z]{2}(-[A-Z]+)?$/.test(code) ? code : undefined;
};

// Whole months from one date to another; null if either date can't be read.
export function monthsBetween(from: string, to: string) {
  const a = new Date(from), b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
}

// A share as the spec adds it up: ten decimals, so a sum lands on 25% the way the exact fractions do.
const PLACES = 10;

export function toCase(c: KybFacts): { case: Case; details: KybDetails } {
  const e = c.entity ?? {};
  const own = c.ownership ? ownership(c.ownership) : null;
  const registry_age_months = e.registry_filed ? monthsBetween(e.registry_filed, c.review_date) : null;
  const control_person_identified: Tri = c.control_person?.name ? "yes" : c.control_person === null ? "no" : "unknown";
  // Everyone the case names: the agent's people, every named owner, the control person. Each carries what the
  // spec needs to decide whether 3.2 and 3.3 make them an identified individual. Anyone the agent left out
  // has every screening fact unknown, so if they count, their screening is pending rather than skipped.
  const named = new Map<string, Person & { listed: string }>();
  for (const p of c.people ?? []) named.set(p.name, { ...p, listed: "yes" });
  for (const name of own?.people.keys() ?? []) if (!named.has(name)) named.set(name, { name, listed: "no" });
  if (c.control_person?.name && !named.has(c.control_person.name)) named.set(c.control_person.name, { name: c.control_person.name, listed: "no" });
  // A company on the certification isn't an individual; the case-file checks flag it.
  const company = (name: string, hs: Holder[] = c.ownership ?? []): boolean =>
    hs.some((h) => (h.name === name && h.type !== "person") || company(name, h.owners ?? []));
  const certified = new Map((c.certification ?? []).filter((o) => !company(o.name)).map((o) => [o.name, o.pct]));
  for (const name of certified.keys()) if (!named.has(name)) named.set(name, { name, listed: "no" });
  const people = [...named.values()].map((p) => ({
    ...p, residence: isoCode(p.residence),
    control_person: c.control_person === undefined ? "unknown" : c.control_person?.name === p.name ? "yes" : "no",
    share_pct: own ? toPercent(own.people.get(p.name) ?? { n: 0n, d: 1n }, PLACES) : null,
    certified_pct: certified.get(p.name) ?? 0,
  }));
  return {
    case: {
      facts: {
        excluded: e.excluded, nonprofit: e.nonprofit, industry: e.industry, licence_verified: e.licence_verified,
        country: isoCode(e.country), entity_sanctions: e.screening?.sanctions, entity_adverse_media: e.screening?.adverse_media,
      },
      items: {
        people,
        excluded_owners: own?.excluded.map((x, i) => ({ name: x.name ?? `unnamed excluded entity ${i + 1}`, excluded_share_pct: toPercent(x.share, PLACES) })) ?? null,
      },
      computed: {
        control_person_identified, registry_age_months,
        unaccounted_pct: own ? toPercent(own.unaccounted, PLACES) : null,
        over_allocated: own ? (own.overAllocated.length ? "yes" : "no") : null,
      },
    },
    details: {
      unaccounted_pct: own ? toPercent(own.unaccounted) : null, registry_age_months, control_person_identified,
      people_pct: Object.fromEntries([...(own?.people ?? new Map())].map(([k, v]) => [k, toPercent(v)])),
      trusts: (own?.trusts ?? []).map((t) => `${t.name ?? "unnamed trust"} (${toPercent(t.share)}%)`), loops: own?.loops ?? [],
      over_allocated: own?.overAllocated ?? [],
    },
  };
}

// The owners 3.3 requires to be identified, by the spec's own rule: who counts once nobody is listed by the agent,
// named control person or certified by the customer. The case-file checks use it to compare against the customer's certification.
export function ownersToIdentify(spec: Spec, c: KybFacts): string[] {
  const counts = evaluate(spec, toCase({ ...c, people: [], control_person: null, certification: null }).case).counts.people ?? {};
  return Object.entries(counts).filter(([, v]) => v === "yes").map(([name]) => name);
}

// The general evaluator on a KYB case, plus KYB's own details and a note when ownership loops back on itself.
export function evaluateKyb(spec: Spec, c: KybFacts): Result & { computed: KybDetails } {
  const { case: kase, details } = toCase(c);
  const r = evaluate(spec, kase);
  if (details.loops.length) r.notes.push(`Ownership loops back on itself (${details.loops.join("; ")}); a person should look at it.`);
  return { ...r, computed: details };
}
