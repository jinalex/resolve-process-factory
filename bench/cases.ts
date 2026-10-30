// Synthetic KYB cases for the comparison, as raw facts (the mocked evidence system answers from them). A seeded
// generator, so the same seed gives the same cases. Most cases are ordinary; the rest sit on the edges the SOP
// changes and the planted problems touch: shares between 20% and 25%, filings 6 to 12 months old, ID checks still
// pending, licensed MSBs. People the SOP never asks about have clean records. Nothing here states an outcome: the answer key is the evaluator under the approved spec.
import { createHash } from "node:crypto";
import type { Holder } from "../packs/kyb/ownership.ts";
import { evaluate } from "../core/evaluate.ts";
import type { Spec } from "../core/spec.ts";
import { type KybFacts, type Person, toCase } from "../packs/kyb/facts.ts";
import { loadChanges } from "./changes.ts";

export type BenchCase = { case_id: string; facts: KybFacts };

// Who the SOP could ask about: the people the spec counts with nobody listed by the agent, under the widest bar the
// comparison uses (owners from 20%), as if the entity were an ordinary company. Excluded entities and nonprofits keep
// their owners' records as drawn, so the agent has to apply those exemptions itself.
export function couldBeAsked(facts: KybFacts, wide: Spec = loadChanges().find((c) => c.key === "owners-20")!.spec): Set<string> {
  const ordinary = { ...facts, entity: { ...facts.entity, excluded: "no", nonprofit: "no" }, people: [] };
  const counts = evaluate(wide, toCase(ordinary).case).counts.people ?? {};
  return new Set(Object.entries(counts).filter(([, v]) => v !== "no").map(([name]) => name));
}

// mulberry32: small, seeded, good enough to spread cases.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ava", "Ben", "Chloe", "Dev", "Elif", "Farah", "Goran", "Hana", "Ivan", "Jia", "Kofi", "Lena", "Mateo", "Nora", "Omar", "Priya", "Quinn", "Rosa", "Sven", "Tara", "Umar", "Vera", "Wen", "Yusuf", "Zoe"];
const LAST = ["Abara", "Brandt", "Castillo", "Dubois", "Eriksen", "Fofana", "Gupta", "Haddad", "Ishikawa", "Jensen", "Kowalski", "Lindqvist", "Moreau", "Nakamura", "Okafor", "Petrov", "Quinlan", "Rahman", "Silva", "Tanaka", "Ueda", "Vargas", "Weiss", "Yilmaz", "Zhou"];
const CO = ["Alder", "Birch", "Cobalt", "Delta", "Ember", "Fjord", "Granite", "Harbor", "Iris", "Juniper", "Kestrel", "Linden", "Meridian", "Nimbus", "Orchid"];
const REVIEW = "2026-10-27";

export function generateCases(n: number, seed = 20261029): BenchCase[] {
  const r = rng(seed);
  const wide = loadChanges().find((c) => c.key === "owners-20")!.spec;
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const used = new Set<string>();
  const name = () => { for (;;) { const s = `${pick(FIRST)} ${pick(LAST)}`; if (!used.has(s)) { used.add(s); return s; } } };
  // Company names are unique within a case too: the evidence system finds a company by its name.
  const company = (kind: string) => { for (;;) { const s = `${pick(CO)} ${kind}`; if (!used.has(s)) { used.add(s); return s; } } };
  const monthsAgo = (m: number, day: number) => {
    const d = new Date(Date.UTC(2026, 9 - m, day));
    return d.toISOString().slice(0, 10);
  };

  // Shares that add up to `total`, in whole percent, with extra weight on 20-25%.
  const split = (k: number, total: number): number[] => {
    if (k === 1) return [total];
    const want = chance(0.4) ? pick([20, 21, 22, 24, 25, 26]) : Math.round(total * (0.3 + r() * 0.4));
    const first = Math.max(1, Math.min(want, total - (k - 1)));
    return [first, ...split(k - 1, total - first)];
  };

  const cases: BenchCase[] = [];
  for (let i = 1; i <= n; i++) {
    used.clear();
    const excluded = chance(0.04), nonprofit = !excluded && chance(0.07);
    const industry = chance(0.82) ? "normal" : pick(["msb", "msb", "msb", "crypto", "prohibited"]);
    const country = chance(0.9) ? "US" : pick(["DE", "GB", "CA", "DE", "VN", "IR"]);
    // Filing ages spread over 0-20 months, with extra weight between 6 and 12.
    const age = chance(0.35) ? 6 + Math.floor(r() * 6) : Math.floor(r() * 21);
    const people: Person[] = [];
    const person = (n: string): Person => {
      const p: Person = {
        name: n,
        residence: chance(0.97) ? country : pick(["VE", "KE", "IR", "GB"]),
        nationality: "US",
        id_verified: chance(0.9) ? "yes" : chance(0.7) ? "unknown" : "no",
        sanctions: chance(0.97) ? "none" : pick(["potential", "confirmed", "unknown", "unknown"]),
        pep: chance(0.03) ? "yes" : "no",
        adverse_media: chance(0.02) ? "yes" : "no",
      };
      people.push(p);
      return p;
    };

    // Who owns it: one to four direct holders. A company holder's owners are known or not; some shares are unlisted.
    const holders: Holder[] = [];
    if (!excluded) {
      const unlisted = chance(0.12) ? pick([10, 20, 22, 30]) : 0;
      const k = 1 + Math.floor(r() * 4);
      for (const pct of split(k, 100 - unlisted)) {
        if (chance(0.18)) {
          const co = company("Holdings LLC");
          const known = chance(0.8);
          const inner = known ? split(1 + Math.floor(r() * 2), 100).map((p) => ({ name: person(name()).name, type: "person" as const, pct: p })) : null;
          holders.push({ name: co, type: "entity", pct, owners: inner });
        } else if (chance(0.05)) {
          holders.push({ name: company("Fund Ltd"), type: "excluded_entity", pct });
        } else {
          holders.push({ name: person(name()).name, type: "person", pct });
        }
      }
      if (unlisted) holders.push({ name: null, type: "unknown", pct: unlisted });
    }
    const control = chance(0.95) ? (people[0]?.name ?? person(name()).name) : null;
    if (control && !people.some((p) => p.name === control)) person(control);
    const entity: KybFacts["entity"] = {
      country, excluded: excluded ? "yes" : "no", nonprofit: nonprofit ? "yes" : "no", industry,
      licence_verified: industry === "msb" && chance(0.6) ? "yes" : "no",
      registry_filed: monthsAgo(age, 1 + Math.floor(r() * 26)),
      screening: { sanctions: chance(0.98) ? "none" : pick(["potential", "confirmed"]), adverse_media: chance(0.03) ? "yes" : "no" },
    };
    // Someone the SOP could never ask about (couldBeAsked) gets a clean record. Whether a screened small holder's
    // findings count is a reading the SOP leaves open; keeping it out of the cases keeps the comparison on the
    // questions the SOP does answer, under 3.3 as written and under the 20% change.
    const facts: KybFacts = {
      review_date: REVIEW, entity,
      ownership: excluded ? [] : holders,
      control_person: control ? { name: control, basis: "Chief Executive Officer" } : null,
      people,
      certification: holders.filter((h) => h.name).map((h) => ({ name: h.name!, pct: h.pct })),
    };
    const asked = couldBeAsked(facts, wide);
    for (const p of people) {
      if (!asked.has(p.name)) Object.assign(p, { residence: country, id_verified: "yes", sanctions: "none", pep: "no", adverse_media: "no" });
    }
    cases.push({ case_id: `B-${String(i).padStart(3, "0")}`, facts });
  }
  return cases;
}

// What a recorded run was scored against besides its prompt: the case's facts and the spec. bench/run.ts records it,
// so a run made on another generator seed or spec isn't scored against this key (bench/improve.ts).
export const caseFingerprint = (facts: unknown, spec: unknown) => createHash("sha256").update(JSON.stringify({ facts, spec })).digest("hex");
