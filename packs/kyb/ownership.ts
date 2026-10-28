// The arithmetic behind SOP 3.3: who holds what share of the applicant, through every chain of companies.
// Shares multiply down a chain and add up across chains, kept as exact fractions. Whether that makes ownership
// complete, and who must be identified, is for the spec to decide (3.3's rules in spec/kyb-v1.json).
import { type Frac, ONE, ZERO, add, cmp, fromPercent, mul, sub, toPercent } from "../../core/frac.ts";

export type Holder = {
  name: string | null;
  type: "person" | "entity" | "excluded_entity" | "trust" | "unknown";
  pct: number | string;
  owners?: Holder[] | null; // for an entity: null when its owners are unknown
};

export type OwnershipResult = {
  unaccounted: Frac;              // shares held by no named person and no excluded entity
  people: Map<string, Frac>;      // each named person's total share, across every chain
  excluded: { name: string | null; share: Frac }[]; // each excluded entity's share; a named one's across every chain
  trusts: { name: string | null; share: Frac }[];
  loops: string[];                // companies that own themselves through a chain; flagged for a person
  overAllocated: string[];        // levels whose listed shares add up to more than 100%
};

export function ownership(holders: Holder[]): OwnershipResult {
  const people = new Map<string, Frac>();
  const excluded = new Map<string, Frac>(); // a named excluded entity's total share, across every chain
  const unnamed: Frac[] = [];               // an unnamed one can't be added up across chains, so each share stands alone
  const trusts: OwnershipResult["trusts"] = [];
  const loops: string[] = [], overAllocated: string[] = [];
  let accounted = ZERO;

  const walk = (level: Holder[], scale: Frac, path: string[], where: string) => {
    let listed = ZERO;
    for (const h of level) {
      const pct = fromPercent(h.pct);
      listed = add(listed, pct);
      const share = mul(scale, pct);
      if (h.type === "person" && h.name) {
        people.set(h.name, add(people.get(h.name) ?? ZERO, share));
        accounted = add(accounted, share);
      } else if (h.type === "excluded_entity") {
        if (h.name) excluded.set(h.name, add(excluded.get(h.name) ?? ZERO, share));
        else unnamed.push(share);
        accounted = add(accounted, share);
      } else if (h.type === "trust") {
        trusts.push({ name: h.name, share }); // no SOP rule for trusts: the share stays unaccounted
      } else if (h.type === "entity" && h.name && h.owners) {
        if (path.includes(h.name)) loops.push([...path, h.name].join(" > "));
        else walk(h.owners, share, [...path, h.name], h.name);
      }
      // an unnamed person, an unknown holder, or a company whose owners are unknown: stays unaccounted
    }
    if (cmp(listed, ONE) > 0) overAllocated.push(`${where}: listed shares add up to ${toPercent(listed)}%`);
  };

  walk(holders, ONE, [], "the applicant");
  // A table listing over 100% can account for more than everything; nobody's unaccounted share is below zero.
  const rest = sub(ONE, accounted);
  const unaccounted = cmp(rest, ZERO) < 0 ? ZERO : rest;
  return { unaccounted, people, trusts, loops, overAllocated,
           excluded: [...[...excluded].map(([name, share]) => ({ name, share })), ...unnamed.map((share) => ({ name: null, share }))] };
}
