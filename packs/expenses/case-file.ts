// The expense agent's claim file and Resolve's checks on it. Every check here is a general one from
// core/evidence.ts: the quotes are in the documents, and the outcome follows from the facts under the spec.
// Expenses has no checks of its own yet; KYB's (the control person, 4.4's bar) show where they would go.
import { type Documents, EvidenceCheck, type Fact, type Problem, pendingFacts } from "../../core/evidence.ts";
import { evaluate } from "../../core/evaluate.ts";
import type { Outcome, Spec } from "../../core/spec.ts";
import { type Claim, day, dollars, toCase } from "./claim.ts";

export type LineEvidence = { date?: Fact; description: string; category?: Fact; cabin?: Fact; amount_usd?: Fact; itemised_receipt?: Fact;
                             recipient_official?: Fact; pre_approved?: Fact };
export type ClaimFile = {
  claim_id: string;
  claimant: Fact; approver?: Fact; submitted: Fact; director_signed?: Fact;
  lines: LineEvidence[];
  outcome: Outcome;
  reason: string;
};
export type Check = { passed: boolean; problems: Problem[]; flags: string[]; missing: string[]; outcome: Outcome; decided_by: string[]; notes: string[] };

export function checkClaim(spec: Spec, file: ClaimFile, docs: Documents): Check {
  const ev = new EvidenceCheck(docs);
  const opt = (f: Fact | undefined, what: string) => (f ? ev.fact(f, what, "") : undefined);
  // A date must be a calendar date (YYYY-MM-DD); anything else is reported and left unknown.
  const date = (f: Fact | undefined, what: string) => {
    const v = String(ev.fact(f, what, "date"));
    if (v !== "unknown" && day(v) === null) { ev.say("missing", `${what[0].toUpperCase()}${what.slice(1)} isn't a date written YYYY-MM-DD: "${v}".`, "date"); return null; }
    return v === "unknown" ? null : v;
  };
  const claim: Claim = {
    claimant: ev.fact(file.claimant, "who submitted the claim", "claimant"),
    approver: opt(file.approver, "who approved the claim") ?? null,
    submitted: date(file.submitted, "when the claim was submitted") ?? "unknown",
    director_signed: opt(file.director_signed, "whether the Finance Director signed"),  // needed only at $5,000 or more (3.3)
    lines: file.lines.map((l) => {
      const amount = String(ev.fact(l.amount_usd, `the amount of "${l.description}"`, "amount_usd"));
      const n = amount.trim() === "" ? NaN : Number(amount);
      if (amount !== "unknown" && !dollars(n)) ev.say("missing", `The amount of "${l.description}" isn't an amount in dollars: "${amount}".`, "amount_usd");
      return {
        description: l.description, date: date(l.date, `the date of "${l.description}"`), amount_usd: dollars(n) ? n : null,
        category: ev.fact(l.category, `the category of "${l.description}"`, "category"),
        cabin: opt(l.cabin, `the cabin for "${l.description}"`),
        itemised_receipt: opt(l.itemised_receipt, `whether "${l.description}" has an itemised receipt`),  // needed only at $75 or more (4.1)
        recipient_official: opt(l.recipient_official, `whether "${l.description}" went to an official`),
        pre_approved: opt(l.pre_approved, `whether "${l.description}" was pre-approved`),
      };
    }),
  };
  const r = evaluate(spec, toCase(claim));
  ev.outcome(file.outcome, r);
  return { passed: ev.problems.length === 0, problems: ev.problems, flags: ev.flags, missing: pendingFacts(r), outcome: r.outcome,
           decided_by: r.decided_by.map((h) => h.rule), notes: r.notes };
}
