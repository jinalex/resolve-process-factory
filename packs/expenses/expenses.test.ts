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

describe("Z3 checks on the expenses SOP", () => {
  it("finds the same three kinds of problem as in KYB: a rule that never applies, an unknown read as a no, a wasted fact", async () => {
    const findings = await checkSop(spec);
    expect(findings.map((f) => [f.kind, f.id])).toEqual([
      ["contradiction", "dead-pre-approved-business"], // 4.5 can never apply: 4.4 always wins
      ["unknowns", "unknown-receipt"],                 // 4.1 returns a claim whose receipt is pending; 2.2 says incomplete
      ["contradiction", "unused-pre_approved"],        // follows from 4.5
    ]);
    expect(findings[1].example).toBe(`receipt for line 1 is unknown. If receipt for line 1 turned out "yes", 4.1 would not apply.`);
  }, 30000);

  it("finds nothing once 4.1 follows 2.2 and 4.5 is removed", async () => {
    const fixed: Spec = structuredClone(spec);
    fixed.rules = fixed.rules.filter((r) => r.id !== "pre-approved-business");
    fixed.facts = fixed.facts.filter((f) => f.key !== "pre_approved");
    fixed.rules.find((r) => r.id === "receipt")!.when =
      { some: "lines", where: { all: [{ fact: "amount_band", is: "75_or_more" }, { fact: "receipt", is: "no" }] } };
    expect(await checkSop(fixed)).toEqual([]);
  }, 30000);

  it("agrees with the evaluator on 300 random claims", async () => {
    const ctx = await z3Context();
    const enc = new Encoder(ctx, spec, 3);
    const s = enc.symCase("agree");
    const { outcome } = enc.run(s);
    const w = <T>(clean: T, ...others: T[]) => fc.oneof({ arbitrary: fc.constant(clean), weight: 3 * others.length }, ...others.map((o) => ({ arbitrary: fc.constant(o), weight: 1 })));
    const line: fc.Arbitrary<Line> = fc.record({
      date: w<string | null>("2026-10-01", "2026-07-01", null), category: w("hotel", "airfare", "meals", "alcohol", "gift", "unknown"),
      cabin: w<string | undefined>(undefined, "economy", "premium_economy", "business", "first"), amount_usd: w<number | null>(40, 120, 6000, null),
      receipt: w("yes", "no", "unknown"), recipient_official: w<string | undefined>(undefined, "yes", "no", "unknown"),
      pre_approved: w<string | undefined>(undefined, "yes", "no"),
    });
    const claim: fc.Arbitrary<Claim> = fc.record({
      claimant: fc.constant("A"), approver: w<string | null>("B", "A", null, "unknown"), submitted: fc.constant("2026-10-20"),
      director_signed: w("no", "yes", "unknown"), lines: fc.array(line, { minLength: 0, maxLength: 3 }),
    });
    for (const c of [...examples.map((e) => e.claim), ...fc.sample(claim, { numRuns: 300, seed: 11 })]) {
      const kase = toCase(c);
      const solver = new ctx.Solver();
      for (const d of [...s.domain, ...enc.pin(s, kase)]) solver.add(d);
      expect(await solver.check()).toBe("sat");
      expect(spec.order[Number(solver.model().eval(outcome).toString())]).toBe(evaluate(spec, kase).outcome);
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

  it("doesn't call a receipt or sign-off missing when the file leaves it out; the rules decide if it was needed", () => {
    const f = load("CL-1");
    delete f.director_signed;
    expect(run(f)).toMatchObject({ passed: true, problems: [], outcome: "approve" });
  });

  it("says what's missing when a receipt is pending", () => {
    const f = load("CL-1");
    f.lines[0].receipt = { value: "unknown", source: "claim_form.md", quote: "Hotel | $240.00 | Yes" };
    f.outcome = "return";
    const r = run(f);
    expect(r).toMatchObject({ passed: true, outcome: "return" });   // 4.1 as written; Z3's unknowns finding is why that's questionable
  });
});
