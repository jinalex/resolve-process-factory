import { describe, expect, it } from "vitest";
import { kybSpec, loadExamples } from "./examples.ts";
import { evaluateKyb as evaluate } from "./facts.ts";

// The right outcome for each example under the SOP as written, checked by hand against the documents.
// The evaluator computes it from raw facts; nothing in truth.json states the outcome.
const expected: Record<string, [string, string]> = {
  "EX-1": ["escalate", "pep"],                    // Halcyon's sole owner is a PEP
  "EX-2": ["request_docs", "ownership-complete"], // 30% Class B units unaccounted
  "EX-3": ["escalate", "industry-restricted"],    // 5.3 never decides
  "EX-4": ["request_docs", "registry-fresh"],     // filing 14 months old
  "EX-5": ["decline", "country-sanctioned"],      // 30% owner moved to Tehran
  "EX-6": ["escalate", "pep"],                    // with a note on the pending sanctions check
};

describe("example cases", () => {
  const spec = kybSpec();
  for (const ex of loadExamples()) {
    it(`${ex.case_id} ${ex.name}`, () => {
      const r = evaluate(spec, ex.facts);
      expect([r.outcome, r.decided_by[0]?.rule]).toEqual(expected[ex.case_id]);
      // Only EX-6 gets a note from the evaluator. EX-5's other finding (the documents disagree) is for the case file checks.
      expect(r.notes).toEqual(ex.case_id === "EX-6" ? ["4.1 could still apply once sanctions for Thomas Finch is known, and would mean decline."] : []);
    });
  }
  it("covers all six", () => expect(loadExamples().map((e) => e.case_id)).toEqual(Object.keys(expected)));
});
