import { describe, expect, it } from "vitest";
import { type Holder, ownership } from "./ownership.ts";
import { toPercent } from "./frac.ts";

const pct = (hs: Holder[]) => { const r = ownership(hs); return { ...r, unaccounted: toPercent(r.unaccounted) }; };

describe("ownership (SOP 3.3)", () => {
  it("adds one person's shares across chains", () => {
    const r = ownership([
      { name: "Ana", type: "person", pct: 15 },
      { name: "HoldCo", type: "entity", pct: 30, owners: [{ name: "Ana", type: "person", pct: 50 }, { name: "Ben", type: "person", pct: 50 }] },
      { name: "Cy", type: "person", pct: 55 },
    ]);
    expect(toPercent(r.people.get("Ana")!)).toBe(30); // 15% direct + 50% of 30%
    expect(r.complete).toBe(true);
  });

  it("multiplies shares down a chain", () => {
    const r = ownership([{ name: "A", type: "entity", pct: 80, owners: [{ name: "B", type: "entity", pct: 50, owners: [{ name: "Dee", type: "person", pct: 100 }] }] }]);
    expect(toPercent(r.people.get("Dee")!)).toBe(40);
  });

  it("is incomplete at exactly 25% unaccounted, complete just below", () => {
    expect(pct([{ name: "A", type: "person", pct: 75 }]).complete).toBe(false);
    expect(pct([{ name: "A", type: "person", pct: "75.01" }]).complete).toBe(true);
  });

  it("never rounds: three thirds of 33.33% leave 0.01% unaccounted", () => {
    const r = pct(["A", "B", "C"].map((n) => ({ name: n, type: "person" as const, pct: "33.33" })));
    expect(r.unaccounted).toBe(0.01);
    expect(r.complete).toBe(true);
  });

  it("counts an excluded entity's share as accounted for", () => {
    expect(pct([{ name: "Big Bank", type: "excluded_entity", pct: 60 }, { name: "A", type: "person", pct: 40 }]).complete).toBe(true);
  });

  it("leaves a company with unknown owners unaccounted", () => {
    const r = pct([{ name: "A", type: "person", pct: 60 }, { name: "Shell LLC", type: "entity", pct: 40, owners: null }]);
    expect(r.unaccounted).toBe(40);
    expect(r.complete).toBe(false);
  });

  it("leaves unlisted shares unaccounted (EX-2: only 70% listed)", () => {
    expect(pct([{ name: "M", type: "person", pct: 45 }, { name: "A", type: "person", pct: 25 }]).unaccounted).toBe(30);
  });

  it("flags a loop and leaves its share unaccounted", () => {
    const r = pct([{ name: "A", type: "person", pct: 70 }, { name: "X", type: "entity", pct: 30, owners: [{ name: "X", type: "entity", pct: 100, owners: [] }] }]);
    expect(r.loops).toEqual(["X > X"]);
    expect(r.complete).toBe(false);
  });

  it("records trusts and leaves their share unaccounted (no SOP rule covers trusts)", () => {
    const r = pct([{ name: "A", type: "person", pct: 70 }, { name: "Family Trust", type: "trust", pct: 30 }]);
    expect(r.trusts.map((t) => toPercent(t.share))).toEqual([30]);
    expect(r.complete).toBe(false);
  });

  it("flags listed shares over 100%, and never calls them complete", () => {
    const r = pct([{ name: "A", type: "person", pct: 60 }, { name: "B", type: "person", pct: 60 }]);
    expect(r.overAllocated).toHaveLength(1);
    expect(r.complete).toBe(false);
  });

  it("exempts an excluded entity's share only at 25% or more (3.3)", () => {
    const bank = (name: string, pct: number) => ({ name, type: "excluded_entity" as const, pct });
    expect(pct([{ name: "A", type: "person", pct: 75 }, bank("Bank", 25)])).toMatchObject({ unaccounted: 0, complete: true });
    // Two banks at 20% each: neither qualifies, so their 40% stays unaccounted.
    expect(pct([{ name: "A", type: "person", pct: 60 }, bank("Bank A", 20), bank("Bank B", 20)])).toMatchObject({ unaccounted: 40, complete: false });
  });
});
