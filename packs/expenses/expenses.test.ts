// A second SOP through the same core, to show nothing in core/ is KYB-shaped: the same evaluator, the same
// Z3 checks and the same evidence checks, on employee expense claims.
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import fc from "fast-check";
import { evaluate } from "../../core/evaluate.ts";
import { Documents } from "../../core/evidence.ts";
import { ROOT, loadSpec } from "../../core/load.ts";
import { checkSop } from "../../core/sop-checks.ts";
import { type Spec, validateSpec } from "../../core/spec.ts";
import { Encoder, shutdown, z3Context } from "../../core/z3.ts";
import { type ClaimFile, checkClaim } from "./case-file.ts";
import { type Claim, type Line, toCase } from "./claim.ts";

const spec = loadSpec("spec/expenses-v1.json");
const examples: { id: string; name: string; expected: [string, string | null]; claim: Claim }[] =
  JSON.parse(readFileSync(join(ROOT, "packs/expenses/examples.json"), "utf8"));
afterAll(shutdown);

describe("the expenses spec", () => {
  it("is well formed", () => expect(validateSpec(spec)).toEqual([]));

  for (const ex of examples) it(`${ex.id} ${ex.name}`, () => {
    const r = evaluate(spec, toCase(ex.claim));
    expect([r.outcome, r.decided_by[0]?.rule ?? null]).toEqual(ex.expected);
  });

  it("treats a claim with no lines as incomplete", () => {
    const r = evaluate(spec, toCase({ ...examples[0].claim, lines: [] }));
    expect(r.outcome).toBe("incomplete");
    expect(r.decided_by.find((h) => h.rule === "alcohol")?.because).toEqual(["what the claim's lines are"]);
  });

  it("never reads an unknown approver or category as a known no", () => {
    const claim = structuredClone(examples[0].claim);
    claim.approver = "unknown";
    expect(evaluate(spec, toCase(claim)).outcome).toBe("incomplete");
    const line = { ...claim.lines![0], category: "unknown", cabin: undefined, recipient_official: undefined };
    const c = toCase({ ...examples[0].claim, lines: [line] }).items.lines![0];
    expect([c.cabin, c.recipient_official]).toEqual([undefined, undefined]);
  });

  it("notes a more severe rule that might still apply", () => {
    const claim = structuredClone(examples[0].claim);
    claim.lines![1].category = "gift"; // a gift, recipient unknown: 4.3 could still mean escalate
    const r = evaluate(spec, toCase(claim));
    expect(r.outcome).toBe("incomplete");
    expect(r.notes).toEqual(["4.3 could still apply once recipient official for Dinner is known, and would mean escalate."]);
  });
});

// What the reviews found (Codex, Grok, Gemini): claims the pack used to read wrongly. Each fails on the old code.
describe("reading a claim", () => {
  const base: Claim = { claimant: "Mara Okafor", approver: "Tom Reyes", submitted: "2026-10-20", director_signed: "no", lines: [] };
  const line = (o: Partial<Line> = {}): Line => ({ date: "2026-10-08", category: "meals", amount_usd: 40, itemised_receipt: "yes", ...o });
  const outcome = (c: Partial<Claim>) => evaluate(spec, toCase({ ...base, ...c })).outcome;

  it("decides each rule at its boundary, as the SOP says", () => {
    expect(outcome({ lines: [line({ date: "2026-08-21" })] })).toBe("approve");           // 60 days
    expect(outcome({ lines: [line({ date: "2026-08-20" })] })).toBe("reject");            // 61 days (3.1)
    expect(outcome({ approver: "Mara Okafor", lines: [line()] })).toBe("reject");         // 3.2
    expect(outcome({ lines: [line({ amount_usd: 2499.99 }), line({ amount_usd: 2500 })] })).toBe("approve");
    expect(outcome({ lines: [line({ amount_usd: 2500 }), line({ amount_usd: 2500 })] })).toBe("escalate");  // $5,000 (3.3)
    expect(outcome({ director_signed: "yes", lines: [line({ amount_usd: 5000 })] })).toBe("approve");
    expect(outcome({ lines: [line({ amount_usd: 74.99, itemised_receipt: "no" })] })).toBe("approve");
    expect(outcome({ lines: [line({ amount_usd: 75, itemised_receipt: "no" })] })).toBe("return");          // $75 (4.1)
    expect(outcome({ lines: [line({ category: "airfare", cabin: "first", amount_usd: 900 })] })).toBe("escalate");  // 4.4
  });

  it("an unknown or blank claimant might be the approver", () => {
    for (const claimant of ["unknown", "", "  "]) expect(outcome({ claimant, lines: [line()] })).toBe("incomplete");
  });

  it("the same name in another case or spacing is the same person", () => {
    expect(outcome({ approver: " mara  OKAFOR", lines: [line()] })).toBe("reject");
  });

  it("a date that isn't YYYY-MM-DD is unknown, never compared as text", () => {
    for (const date of ["8/1/2026", "08/10/2026", "not-a-date", "unknown", "2026-02-31"])
      expect(outcome({ lines: [line({ date: "2026-10-01" }), line({ date })] })).toBe("incomplete");
    expect(outcome({ submitted: "20/10/2026", lines: [line()] })).toBe("incomplete");
  });

  it("a negative amount is unknown, so it can't pull a total under $5,000", () => {
    expect(outcome({ lines: [line({ amount_usd: 5000 }), line({ amount_usd: -100 })] })).toBe("incomplete");
  });

  it("an airfare line's cabin is never assumed", () => {
    expect(outcome({ lines: [line({ category: "airfare", amount_usd: 500 })] })).toBe("incomplete");
    expect(outcome({ lines: [line({ category: "airfare", cabin: "none", amount_usd: 500 })] })).toBe("incomplete");
    expect(outcome({ lines: [line({ category: "hotel" })] })).toBe("approve");  // a hotel line needs no cabin
  });
});

describe("Z3 checks on the expenses SOP", () => {
  it("finds the same three kinds of problem as in KYB: a rule that never applies, an unknown read as a no, a wasted fact", async () => {
    const findings = await checkSop(spec);
    expect(findings.map((f) => [f.kind, f.id])).toEqual([
      ["contradiction", "dead-pre-approved-business"], // 4.5 can never apply: 4.4 always wins
      ["unknowns", "unknown-receipt"],                 // 4.1 returns a claim whose receipt is pending; 2.2 says incomplete
      ["contradiction", "unused-pre_approved"],        // follows from 4.5
    ]);
    expect(findings[1].example).toBe(`itemised receipt for line 1 is unknown. If itemised receipt for line 1 turned out "yes", 4.1 would not apply.`);
  }, 30000);

  it("finds nothing once 4.1 follows 2.2 and 4.5 is removed", async () => {
    const fixed: Spec = structuredClone(spec);
    fixed.rules = fixed.rules.filter((r) => r.id !== "pre-approved-business");
    fixed.facts = fixed.facts.filter((f) => f.key !== "pre_approved");
    fixed.rules.find((r) => r.id === "receipt")!.when =
      { some: "lines", where: { all: [{ fact: "amount_band", is: "75_or_more" }, { fact: "itemised_receipt", is: "no" }] } };
    expect(await checkSop(fixed)).toEqual([]);
  }, 30000);

  it("agrees with the evaluator on 300 random claims, rule by rule", async () => {
    const ctx = await z3Context();
    const enc = new Encoder(ctx, spec, 3);
    const s = enc.symCase("agree");
    const { rules, outcome } = enc.run(s);
    const w = <T>(clean: T, ...others: T[]) => fc.oneof({ arbitrary: fc.constant(clean), weight: 3 * others.length }, ...others.map((o) => ({ arbitrary: fc.constant(o), weight: 1 })));
    const line: fc.Arbitrary<Line> = fc.record({
      date: w<string | null>("2026-10-01", "2026-07-01", "2026-08-21", "2026-08-20", "08/10/2026", null),
      category: w("hotel", "airfare", "meals", "alcohol", "gift", "other", "unknown", "taxi"),
      cabin: w<string | undefined>(undefined, "economy", "premium_economy", "business", "first", "none"),
      amount_usd: w<number | null>(40, 120, 6000, 74.99, 75, 2500, 5000, -5, null),
      itemised_receipt: w("yes", "no", "unknown"), recipient_official: w<string | undefined>(undefined, "yes", "no", "unknown"),
      pre_approved: w<string | undefined>(undefined, "yes", "no", "unknown"),
    });
    const claim: fc.Arbitrary<Claim> = fc.record({
      claimant: w("A", "a ", "unknown", ""), approver: w<string | null>("B", "A", null, "unknown"), submitted: w("2026-10-20", "20/10/2026"),
      director_signed: w("no", "yes", "unknown"), lines: fc.array(line, { minLength: 0, maxLength: 3 }),
    });
    for (const c of [...examples.map((e) => e.claim), ...fc.sample(claim, { numRuns: 300, seed: 11 })]) {
      const kase = toCase(c);
      const solver = new ctx.Solver();
      for (const d of [...s.domain, ...enc.pin(s, kase)]) solver.add(d);
      expect(await solver.check()).toBe("sat");
      const m = solver.model(), r = evaluate(spec, kase);
      const holds = (x: (typeof rules)[number]["applies"]) => m.eval(x).toString() === "true";
      expect(rules.filter((x) => holds(x.applies)).map((x) => x.rule.id)).toEqual(r.applied.map((h) => h.rule));
      expect(rules.filter((x) => holds(x.might)).map((x) => x.rule.id)).toEqual(r.might_apply.map((h) => h.rule));
      expect(spec.order[Number(m.eval(outcome).toString())]).toBe(r.outcome);
    }
  }, 60000);
});

describe("claim file checks", () => {
  const load = (id: string) => JSON.parse(readFileSync(join(ROOT, "packs/expenses/fixtures", `${id}.json`), "utf8")) as ClaimFile;
  const run = (f: ClaimFile) => checkClaim(spec, f, new Documents(join(ROOT, "packs/expenses/claims", f.claim_id)));

  it("passes honest files", () => {
    expect(run(load("CL-1"))).toMatchObject({ passed: true, problems: [], outcome: "approve" });
    expect(run(load("CL-2"))).toMatchObject({ passed: true, problems: [], outcome: "return", decided_by: ["alcohol"] });
  });

  it("catches a quote that isn't in the receipt", () => {
    const f = load("CL-1");
    f.lines[0].amount_usd!.quote = "Total paid: $140.00";
    expect(run(f).problems.map((p) => p.kind)).toEqual(["quote"]);
  });

  it("catches an outcome that doesn't follow, e.g. the wine paid anyway", () => {
    const f = load("CL-2");
    f.outcome = "approve";
    expect(run(f).problems).toEqual([{ kind: "outcome", text: "The file says approve, but the facts in it lead to return: 4.2 applies." }]);
  });

  it("catches an amount that isn't a number, and doesn't band it", () => {
    for (const value of ["$240.00", ""]) {
      const f = load("CL-1");
      f.lines[0].amount_usd!.value = value;
      const r = run(f);
      expect(r.problems.map((p) => p.fact)).toContain("amount_usd");
      expect(r.outcome).not.toBe("approve");
    }
  });

  it("reports a date that isn't YYYY-MM-DD, as the receipt writes it, and leaves it unknown", () => {
    const f = load("CL-1");
    f.lines[0].date!.value = "08/10/2026";
    const r = run(f);
    expect(r.problems.map((p) => p.fact)).toContain("date");
    expect(r.outcome).toBe("incomplete");
  });

  it("reports a negative or non-string amount instead of crashing", () => {
    for (const value of ["-240", 240 as unknown as string]) {
      const f = load("CL-1");
      f.lines[0].amount_usd!.value = value;
      const r = run(f);
      if (value === "-240") expect(r.problems.map((p) => p.fact)).toContain("amount_usd");
      else expect(r.outcome).toBe("approve");
    }
  });

  it("doesn't call a receipt or sign-off missing when the file leaves it out; the rules decide if it was needed", () => {
    const f = load("CL-1");
    delete f.director_signed;
    expect(run(f)).toMatchObject({ passed: true, problems: [], outcome: "approve" });
  });

  it("says what's missing when a receipt is pending", () => {
    const f = load("CL-1");
    f.lines[0].itemised_receipt = { value: "unknown", source: "claim_form.md", quote: "Hotel | $240.00 | Yes" };
    f.outcome = "return";
    const r = run(f);
    expect(r).toMatchObject({ passed: true, outcome: "return" });   // 4.1 as written; Z3's unknowns finding is why that's questionable
  });
});
