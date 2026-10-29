// The evaluator's own properties, checked on random specs and cases (core/arbitrary.ts) rather than on a pack's
// spec, since each holds for any spec in the rule format. These are the statements the Dafny proofs are about
// (docs/DECISIONS.md).
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { type Case, type Result, type Value, evaluate } from "./evaluate.ts";
import { type Spec, validateSpec } from "./spec.ts";
import { BARS, NUMBERS, OUTCOMES, base, refinedArb } from "./arbitrary.ts";

const rank = (spec: Spec, o: string) => spec.order.indexOf(o);
const ids = (hits: { rule: string }[]) => hits.map((h) => h.rule).sort();
const mentionsUnknown = (x: unknown) => JSON.stringify(x).includes("is_unknown");
// Does the rule ask whether a fact is unknown, itself or through what it reaches: a sum the spec works out, and who
// counts in a list it looks at, and that list's empty rule?
function asksUnknown(spec: Spec, rule: string): boolean {
  const seen = new Set<string>();
  const visit = (x: unknown): boolean => {
    const s = JSON.stringify(x) ?? "";   // a computed fact the pack works out has no sum
    if (s.includes("is_unknown")) return true;
    const reached = [...s.matchAll(/"(some|sum_over|computed)":"([^"]+)"/g)].map(([, kind, key]) => `${kind === "computed" ? "c" : "l"} ${key}`);
    return reached.some((k) => {
      if (seen.has(k)) return false;
      seen.add(k);
      const key = k.slice(2);
      return visit(k[0] === "c" ? spec.computed.find((x) => x.key === key)?.sum : spec.collections.find((x) => x.key === key));
    });
  };
  return visit(spec.rules.find((r) => r.id === rule)!.when);
}
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
      if (mentionsUnknown([spec.rules, spec.collections, spec.computed])) return true;
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

  it("2c. lets an outcome other than the unknowns outcome get less severe only through a rule that decided it and asks whether a fact is unknown", () => {
    let eased = 0;
    fc.assert(fc.property(refinedArb, ({ spec, c, refined }) => {
      const before = evaluate(spec, c), after = evaluate(spec, refined), o = before.outcome;
      if (o === spec.unknowns.then || rank(spec, after.outcome) <= rank(spec, o)) return true;
      eased++;
      return before.decided_by.some((h) => asksUnknown(spec, h.rule));
    }), RUNS);
    expect(eased).toBeGreaterThan(10); // the exception does happen, so the property isn't empty
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
    // The whole result, with its lists in rule-ID order: who counts, the sums, every hit and its reasons.
    const sorted = (r: Result) => {
      const by = (hs: Result["applied"]) => [...hs].sort((x, y) => x.rule.localeCompare(y.rule));
      return { ...r, decided_by: by(r.decided_by), applied: by(r.applied), might_apply: by(r.might_apply), notes: [...r.notes].sort() };
    };
    fc.assert(fc.property(shuffled, ({ spec, c, other }) => {
      expect(sorted(evaluate(other, c))).toEqual(sorted(evaluate(spec, c)));
      return true;
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
    // Three thirds make exactly 100; two thirds and 33.33 make just under it.
    const c = (ws: Value[]): Case => ({ facts: {}, items: { items: ws.map((w, i) => ({ name: `i${i}`, w })) }, computed: {} });
    expect(evaluate(spec(100), c(["100/3", "100/3", "100/3"])).outcome).toBe("o1");
    expect(evaluate(spec(100), c(["100/3", "100/3", 33.33])).outcome).toBe("o4");
  });

  it("adds up a list the case doesn't give to unknown, and an empty list to 0", () => {
    // Found by the properties above: a missing list used to add up to 0, so a sum rule quietly didn't apply.
    const spec: Spec = { ...base(), order: OUTCOMES, unknowns: { sop: "1", text: "", then: "o3" }, collections: [{ key: "items", item: "item" }],
      rules: [{ id: "big", sop: "1", text: "", then: "o1", when: { sum: [{ sum_over: "items", of: "w" }], at_least: 1000 } }] };
    const with_ = (items: Case["items"]["items"]): Case => ({ facts: {}, items: { items }, computed: {} });
    expect(evaluate(spec, with_(null)).outcome).toBe("o3");
    expect(evaluate(spec, with_(undefined)).outcome).toBe("o3");
    expect(evaluate(spec, with_([])).outcome).toBe("o4");
    expect(evaluate(spec, with_([{ name: "a", w: 5000 }])).outcome).toBe("o1");
  });

  it("5. reads a word the same whatever its case or surrounding spaces, and an undeclared word as unknown", () => {
    const messy = (word: Value) => fc.tuple(fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }), fc.constantFrom("", " ", "  ", "\t"), fc.constantFrom("", " "))
      .map(([up, before, after]) => typeof word !== "string" ? word
        : before + [...word].map((ch, i) => (up[i % 8] ? ch.toUpperCase() : ch)).join("") + after);
    const withMess = refinedArb.chain(({ spec, c }) => {
      const declared = (v: Value) => (typeof v === "string" && v !== "" ? messy(v) : fc.constant(v));
      const items = c.items.items ?? null;
      // A fact that takes any word keeps it as written, so only its "unknown" is messed up; a computed fact's word
      // is read like a declared one.
      const code = c.facts.code === "unknown" ? messy("unknown") : fc.constant(c.facts.code);
      return fc.record({
        k1: declared(c.facts.k1), k2: declared(c.facts.k2), code, flag: declared(c.computed.flag),
        items: items ? fc.tuple(...items.map((it) => declared(it.g))) : fc.constant(null),
      }).map((m) => ({ spec, c, messy: {
        ...c, facts: { ...c.facts, k1: m.k1, k2: m.k2, code: m.code }, computed: { ...c.computed, flag: m.flag },
        items: { items: items && m.items ? items.map((it, i) => ({ ...it, g: m.items![i] })) : items },
      } satisfies Case }));
    });
    fc.assert(fc.property(withMess, ({ spec, c, messy }) => {
      expect(evaluate(spec, messy)).toEqual(evaluate(spec, c));
      return true;
    }), RUNS);

    // A word the spec doesn't declare decides the same as "unknown" does, for k2 and for k1, which who counts and
    // "some" also read. Only the reasons' wording differs.
    const same = (a: Result, b: Result) => a.outcome === b.outcome && [a.decided_by, a.applied, a.might_apply].map(ids).join("|") ===
      [b.decided_by, b.applied, b.might_apply].map(ids).join("|") && JSON.stringify([a.counts, a.sums]) === JSON.stringify([b.counts, b.sums]);
    fc.assert(fc.property(refinedArb, fc.constantFrom("maybe", "A.", "aa", "b c"), fc.constantFrom("k1", "k2"), ({ spec, c }, word, key) =>
      same(evaluate(spec, { ...c, facts: { ...c.facts, [key]: word } }), evaluate(spec, { ...c, facts: { ...c.facts, [key]: "unknown" } }))), RUNS);
  });
});

// Counterexamples from the PR #16 review (Codex, Gemini, Tenki), each now refused or read the safe way.
describe("found in the PR #16 review", () => {
  const spec = (over: Partial<Spec>): Spec => ({ ...base(), order: OUTCOMES, unknowns: { sop: "1", text: "", then: "o3" },
    collections: [{ key: "items", item: "item" }], rules: [], ...over });
  const rule = (when: Spec["rules"][number]["when"], then = "o1") => [{ id: "r", sop: "1", text: "", then, when }];
  const kase = (facts: Case["facts"], items: Case["items"]["items"] = [], computed: Case["computed"] = {}): Case => ({ facts, items: { items }, computed });

  it("refuses who counts asking whether a fact is unknown, which a \"not\" around \"some\" could flip (Gemini)", () => {
    const s = spec({ collections: [{ key: "items", item: "item", counts_when: { fact: "g", is_unknown: true } }],
      rules: rule({ not: { some: "items", where: { fact: "w", at_least: 50 } } }) });
    expect(validateSpec(s)).toEqual(["Who counts in items asks whether a fact is unknown; an unknown must never decide who counts."]);
  });

  it("reads \"Unknown\" as unknown for a fact that takes any word, and \"YES\" as yes for a computed fact (Gemini)", () => {
    const s = spec({ rules: [...rule({ fact: "code", is: "US" }), { id: "f", sop: "2", text: "", then: "o2", when: { computed: "flag", is: "yes" } }] });
    expect(evaluate(s, kase({ code: " Unknown " })).might_apply.map((h) => h.rule)).toContain("r");
    expect(evaluate(s, kase({ code: "GB" }, [], { flag: "YES" })).applied.map((h) => h.rule)).toEqual(["f"]);
  });

  it("adds up a missing list to 0 where the spec says an empty list is fine, as \"some\" reads it (Tenki)", () => {
    const s = spec({ collections: [{ key: "items", item: "item", empty_ok_when: { fact: "k1", is: "a" } }],
      rules: rule({ sum: [{ sum_over: "items", of: "w" }], at_least: 0 }) });
    expect(evaluate(s, kase({ k1: "a" }, null)).outcome).toBe("o1");
    expect(evaluate(s, kase({ k1: "b" }, null)).outcome).toBe("o3");
  });

  it("refuses a sum over a list of a fact that isn't the items' own (Codex)", () => {
    expect(validateSpec(spec({ rules: rule({ sum: [{ sum_over: "items", of: "n" }], at_least: 25 }) })))
      .toEqual(["Rule r adds up n over items, but n isn't a fact of each item there."]);
  });

  it("refuses a word map that reads one of a fact's own values as another, which would make rules on it dead (Codex)", () => {
    expect(validateSpec(spec({ maps: { k1: { a: "b" } }, rules: rule({ fact: "k1", is: "a" }) })))
      .toEqual([`The word map for k1 reads its own value "a" as "b".`]);
  });
});

// Counterexamples from the PR #17 review (Codex, Grok, Gemini), each now read the safe way.
describe("found in the PR #17 review", () => {
  const spec = (over: Partial<Spec>): Spec => ({ ...base(), order: OUTCOMES, unknowns: { sop: "1", text: "", then: "o3" },
    collections: [{ key: "items", item: "item" }], rules: [], ...over });
  const kase = (facts: Case["facts"], items: Case["items"]["items"] = [], computed: Case["computed"] = {}): Case => ({ facts, items: { items }, computed });

  it("runs the rules a spec holds now, after the caller edits it in place (Codex, Grok, Gemini)", () => {
    const s = spec({ rules: [{ id: "r", sop: "1", text: "", then: "o1", when: { fact: "n", at_least: 100 } }] });
    expect(evaluate(s, kase({ n: 50 })).outcome).toBe("o4");
    (s.rules[0].when as { at_least: number }).at_least = 10;
    expect(evaluate(s, kase({ n: 50 })).outcome).toBe("o1");
  });
});
