// The evaluator's own properties, checked on random specs and cases (core/arbitrary.ts) rather than on a pack's
// spec, since each holds for any spec in the rule format. These are the statements the Dafny proofs are about
// (docs/DECISIONS.md).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { type Case, type Result, type Value, evaluate } from "./evaluate.ts";
import type { Spec } from "./spec.ts";
import { BARS, NUMBERS, OUTCOMES, base, refinedArb } from "./arbitrary.ts";

const rank = (spec: Spec, o: string) => spec.order.indexOf(o);
const ids = (hits: { rule: string }[]) => hits.map((h) => h.rule).sort();
const mentionsUnknown = (x: unknown) => JSON.stringify(x).includes("is_unknown");
// Does the rule, or anything it can reach (who counts, the empty rule), ask whether a fact is unknown?
const asksUnknown = (spec: Spec, rule: string) =>
  mentionsUnknown(spec.rules.find((r) => r.id === rule)!.when) || mentionsUnknown(spec.collections);
const status = (r: Result, rule: string) =>
  r.applied.some((h) => h.rule === rule) ? "yes" : r.might_apply.some((h) => h.rule === rule) ? "unknown" : "no";

const RUNS = { numRuns: 3000 };

describe("the evaluator, on any spec and any case", () => {
  it("1. never gives an outcome below the unknowns outcome while a rule might still apply", () => {
    let below = 0;
    fc.assert(fc.property(refinedArb, ({ spec, c }) => {
      const r = evaluate(spec, c);
      if (rank(spec, r.outcome) <= rank(spec, spec.unknowns.then)) return true;
      below++;
      return r.might_apply.length === 0;
    }), RUNS);
    expect(below).toBeGreaterThan(100); // otherwise the property checks little
  });

  it("2a. keeps a rule's yes or no when unknowns are filled in, unless the rule asks whether a fact is unknown", () => {
    fc.assert(fc.property(refinedArb, ({ spec, c, refined }) => {
      const before = evaluate(spec, c), after = evaluate(spec, refined);
      return spec.rules.every((rule) => {
        const was = status(before, rule.id);
        return was === "unknown" || asksUnknown(spec, rule.id) || status(after, rule.id) === was;
      });
    }), RUNS);
  });

  it("2b. with no rule asking whether a fact is unknown, filling in unknowns never undoes an outcome", () => {
    let checked = 0, changed = 0;
    fc.assert(fc.property(refinedArb, ({ spec, c, refined }) => {
      if (mentionsUnknown(spec.rules) || mentionsUnknown(spec.collections)) return true;
      checked++;
      const before = evaluate(spec, c), after = evaluate(spec, refined);
      const o = before.outcome, u = spec.unknowns.then;
      if (after.outcome !== o) changed++;
      // Below the unknowns outcome nothing was open, so nothing changes.
      if (rank(spec, o) > rank(spec, u) && after.outcome !== o) return false;
      // Any other outcome but the unknowns one can only get more severe.
      if (o !== u && rank(spec, after.outcome) > rank(spec, o)) return false;
      // Whatever decides it now applied or might have applied before.
      const open = new Set([...ids(before.applied), ...ids(before.might_apply)]);
      return ids(after.decided_by).every((id) => open.has(id));
    }), RUNS);
    expect(checked).toBeGreaterThan(300);
    expect(changed).toBeGreaterThan(10);
  });

  it("2c. lets an outcome other than the unknowns outcome get less severe only through a rule that asks whether a fact is unknown", () => {
    fc.assert(fc.property(refinedArb, ({ spec, c, refined }) => {
      const before = evaluate(spec, c), after = evaluate(spec, refined), o = before.outcome;
      if (o === spec.unknowns.then || rank(spec, after.outcome) <= rank(spec, o)) return true;
      return before.applied.some((h) => asksUnknown(spec, h.rule));
    }), RUNS);
  });

  it("2c. for example, KYB's id rule: an unknown id is request_docs, and filling it in can approve", () => {
    const spec: Spec = { ...base(), order: OUTCOMES, unknowns: { sop: "1", text: "", then: "o3" }, collections: [{ key: "items", item: "item" }],
      rules: [{ id: "id", sop: "3.4", text: "", then: "o2", when: { some: "items", where: { any: [{ fact: "g", is: "y" }, { fact: "g", is_unknown: true }] } } }] };
    const one = (g: Value): Case => ({ facts: {}, items: { items: [{ name: "Ana", g }] }, computed: {} });
    expect(evaluate(spec, one("unknown")).outcome).toBe("o2");
    expect(evaluate(spec, one("x")).outcome).toBe("o4");
  });

  it("3. gives the same answer whatever the order of the rules", () => {
    const shuffled = refinedArb.chain(({ spec, c }) =>
      fc.array(fc.integer(), { minLength: spec.rules.length, maxLength: spec.rules.length }).map((keys) => {
        const order = spec.rules.map((r, i) => ({ r, k: keys[i] })).sort((a, b) => a.k - b.k).map((x) => x.r);
        return { spec, c, other: { ...spec, rules: order } };
      }));
    fc.assert(fc.property(shuffled, ({ spec, c, other }) => {
      const a = evaluate(spec, c), b = evaluate(other, c);
      return a.outcome === b.outcome && ids(a.decided_by).join() === ids(b.decided_by).join()
        && ids(a.applied).join() === ids(b.applied).join() && ids(a.might_apply).join() === ids(b.might_apply).join()
        && [...a.notes].sort().join() === [...b.notes].sort().join();
    }), RUNS);
  });

  it("4. adds up exactly: a sum meets its bar exactly when the true total does", () => {
    // The true total, worked out here with whole numbers over a common denominator, apart from core/frac.ts.
    const exact = (v: Value): [bigint, bigint] => {
      if (typeof v === "string") { const [p, q] = v.split("/"); return [BigInt(p), BigInt(q)]; }
      const [whole, dec = ""] = String(v).split(".");
      return [BigInt(whole + dec), 10n ** BigInt(dec.length)];
    };
    const meets = (vs: Value[], at: number) => {
      const [p, q] = vs.map(exact).reduce(([a, b], [c, d]) => [a * d + c * b, b * d], [0n, 1n]);
      return p >= BigInt(at) * q; // q is always positive
    };
    const spec = (at: number): Spec => ({ ...base(), order: OUTCOMES, unknowns: { sop: "1", text: "", then: "o3" },
      collections: [{ key: "items", item: "item", empty_ok_when: { fact: "k1", is: "a" } }],
      rules: [{ id: "bar", sop: "1", text: "", then: "o1", when: { sum: [{ sum_over: "items", of: "w" }], at_least: at } }] });
    const parts = fc.oneof(fc.constantFrom(...NUMBERS),
      fc.tuple(fc.integer({ min: -300, max: 300 }), fc.integer({ min: 1, max: 12 })).map(([p, q]) => `${p}/${q}`));
    let met = 0;
    fc.assert(fc.property(fc.array(parts, { maxLength: 4 }), fc.constantFrom(...BARS, 1, 75), (ws, at) => {
      const c: Case = { facts: {}, items: { items: ws.map((w, i) => ({ name: `i${i}`, w })) }, computed: {} };
      const yes = meets(ws, at);
      if (yes) met++;
      return (evaluate(spec(at), c).outcome === "o1") === yes;
    }), RUNS);
    expect(met).toBeGreaterThan(100);
    // Three thirds make exactly 100, and two make less than 66.67.
    const c = (ws: Value[]): Case => ({ facts: {}, items: { items: ws.map((w, i) => ({ name: `i${i}`, w })) }, computed: {} });
    expect(evaluate(spec(100), c(["100/3", "100/3", "100/3"])).outcome).toBe("o1");
    expect(evaluate(spec(100), c(["100/3", "100/3", 33.33])).outcome).toBe("o4");
  });

  it("5. reads a word the same whatever its case or surrounding spaces, and an undeclared word as unknown", () => {
    const messy = (word: Value) => fc.tuple(fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }), fc.constantFrom("", " ", "  ", "\t"), fc.constantFrom("", " "))
      .map(([up, before, after]) => typeof word !== "string" ? word
        : before + [...word].map((ch, i) => (up[i % 8] ? ch.toUpperCase() : ch)).join("") + after);
    const withMess = refinedArb.chain(({ spec, c }) => {
      const declared = (v: Value) => (typeof v === "string" && v !== "" ? messy(v) : fc.constant(v));
      const items = c.items.items ?? null;
      return fc.record({
        k1: declared(c.facts.k1), k2: declared(c.facts.k2),
        items: items ? fc.tuple(...items.map((it) => declared(it.g))) : fc.constant(null),
      }).map((m) => ({ spec, c, messy: {
        ...c, facts: { ...c.facts, k1: m.k1, k2: m.k2 },
        items: { items: items && m.items ? items.map((it, i) => ({ ...it, g: m.items![i] })) : items },
      } satisfies Case }));
    });
    fc.assert(fc.property(withMess, ({ spec, c, messy }) => {
      expect(evaluate(spec, messy)).toEqual(evaluate(spec, c));
      return true;
    }), RUNS);

    // A word the spec doesn't declare decides the same rules as "unknown" does.
    fc.assert(fc.property(refinedArb, fc.constantFrom("maybe", "A.", "aa", "b c"), ({ spec, c }, word) => {
      const a = evaluate(spec, { ...c, facts: { ...c.facts, k2: word } }), b = evaluate(spec, { ...c, facts: { ...c.facts, k2: "unknown" } });
      return a.outcome === b.outcome && ids(a.applied).join() === ids(b.applied).join() && ids(a.might_apply).join() === ids(b.might_apply).join();
    }), RUNS);
  });
});
