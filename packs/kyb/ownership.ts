// SOP 3.3: ownership is complete only when no unidentified person could own 25% or more.
// Shares multiply down a chain of companies and add up across chains, kept as exact fractions.
import { type Frac, ONE, ZERO, add, cmp, frac, fromPercent, mul, sub, toPercent } from "./frac.ts";

export type Holder = {
  name: string | null;
  type: "person" | "entity" | "excluded_entity" | "trust" | "unknown";
  pct: number | string;
  owners?: Holder[] | null; // for an entity: null when its owners are unknown
};

export type OwnershipResult = {
  complete: boolean;
  unaccounted: Frac;              // shares no identified person or excluded entity accounts for
  people: Map<string, Frac>;      // each identified person's total share, across every chain
  trusts: { name: string | null; share: Frac }[];
  loops: string[];                // companies that own themselves through a chain; flagged for a person
  overAllocated: string[];        // levels whose listed shares add up to more than 100%
};

const QUARTER = frac(1n, 4n);

export function ownership(holders: Holder[]): OwnershipResult {
  const people = new Map<string, Frac>();
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
        accounted = add(accounted, share); // 3.3: no individual needed for this share
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
  const unaccounted = sub(ONE, accounted);
  // Even if one unidentified person held every unaccounted share, they would stay under 25%.
  return { complete: cmp(unaccounted, QUARTER) < 0, unaccounted, people, trusts, loops, overAllocated };
}
