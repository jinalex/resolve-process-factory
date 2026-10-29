import { describe, expect, it } from "vitest";
import { kybSpec } from "../packs/kyb/examples.ts";
import { evaluateKyb } from "../packs/kyb/facts.ts";
import { generateCases } from "./cases.ts";
import { loadChanges } from "./changes.ts";

describe("the comparison's cases and changes", () => {
  const spec = kybSpec();
  const cases = generateCases(60);

  it("the same seed gives the same cases, and a shorter run is the start of a longer one", () => {
    expect(generateCases(60)).toEqual(cases);
    expect(generateCases(10)).toEqual(cases.slice(0, 10));
  });

  it("covers every outcome the SOP can give but incomplete, which only a change brings in", () => {
    const outcomes = new Set(cases.map((c) => evaluateKyb(spec, c.facts).outcome));
    expect([...outcomes].sort()).toEqual(["approve", "decline", "escalate", "request_docs"]);
  });

  it("each change edits the SOP's words and flips some past cases, and only the way it should", () => {
    const sop = loadChanges().map((c) => c.sop);
    expect(sop[0]).toContain("identify every individual who owns 20% or more");
    expect(sop[1]).toContain("must be less than 6 months old");
    expect(sop[2]).toContain("If an identity check has failed, request documents.");
    const flips = loadChanges().map((ch) => cases.flatMap((c) => {
      const [a, b] = [evaluateKyb(spec, c.facts).outcome, evaluateKyb(ch.spec, c.facts).outcome];
      return a === b ? [] : [`${a}->${b}`];
    }));
    expect(new Set(flips[0])).toEqual(new Set(["approve->request_docs"]));   // owners from 20%: more people to identify
    expect(new Set(flips[1])).toEqual(new Set(["approve->request_docs"]));   // filings under 6 months
    expect(new Set(flips[2])).toEqual(new Set(["request_docs->incomplete"])); // a pending ID check is unknown
    expect(flips.map((f) => f.length)).toEqual([2, 15, 6]);
  });
});
