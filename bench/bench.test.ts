import { describe, expect, it } from "vitest";
import { kybSpec } from "../packs/kyb/examples.ts";
import { evaluateIdentified as evaluateKyb } from "../packs/kyb/facts.ts";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { couldBeAsked, generateCases, replays } from "./cases.ts";
import { loadChanges } from "./changes.ts";

describe("the comparison's cases and changes", () => {
  const spec = kybSpec();
  const cases = generateCases(60);

  // Grok's review of PR #33: the recorded runs predate case_sha256, so a missing one was taken as a match.
  it("a run recorded before fingerprints replays on today's case only if its evidence and final check do", () => {
    const runs = gunzipSync(readFileSync(new URL("./runs/rounds/notes-v2.jsonl.gz", import.meta.url))).toString().trim().split("\n").map((l) => JSON.parse(l));
    const byId = new Map(cases.map((c) => [c.case_id, c.facts]));
    expect(runs.every((r) => replays(r, byId.get(r.case_id)!, spec))).toBe(true);
    const r = runs[0];
    // Another case's facts, a changed answer, a changed final check, or no evidence log: not this case.
    expect(replays(r, byId.get(runs.find((x) => x.case_id !== r.case_id)!.case_id)!, spec)).toBe(false);
    const changed = { ...r, evidence_log: r.evidence_log.map((a: { request: string; value: unknown }, i: number) => (i === 0 ? { ...a, value: "XX" } : a)) };
    expect(replays(changed, byId.get(r.case_id)!, spec)).toBe(false);
    expect(replays({ ...r, resolve: { ...r.resolve, notes: [...r.resolve.notes, "x"] } }, byId.get(r.case_id)!, spec)).toBe(false);
    expect(replays({ ...r, evidence_log: undefined }, byId.get(r.case_id)!, spec)).toBe(false);
  });

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
    expect(flips.map((f) => f.length)).toEqual([2, 18, 5]);
  });

  // The rule is the spec's own who-counts rule under the 20% bar (found in the adversarial review: a fixed 20% share
  // cutoff missed people who count through the share nobody is identified for).
  it("someone the SOP could never ask about has a clean record", () => {
    let checked = 0;
    for (const c of cases) {
      const asked = couldBeAsked(c.facts);
      for (const p of c.facts.people ?? []) {
        if (asked.has(p.name)) continue;
        checked++;
        expect([p.residence, p.id_verified, p.sanctions, p.pep, p.adverse_media]).toEqual([c.facts.entity.country, "yes", "none", "no", "no"]);
      }
    }
    expect(checked).toBeGreaterThan(20);
    // Someone under 20% who could still own 20% through the unidentified share is someone the SOP could ask about.
    const b012 = cases.find((c) => c.case_id === "B-012")!;
    expect(couldBeAsked(b012.facts).has("Farah Zhou")).toBe(true);
  });
});

describe("prices", () => {
  it("refuses to price a model it doesn't know, rather than calling it free", async () => {
    const { dollars } = await import("./prices.ts");
    const usage = { input: 1e6, output: 0, cache_read: 0, cache_write: 0 };
    expect(dollars({ model: "claude-opus-5-5", usage })).toBe(4);
    expect(() => dollars({ model: "claude-mystery-9", usage })).toThrow(/No price for claude-mystery-9/);
  });
});
