import { describe, expect, it } from "vitest";
import { type Key, type RoundKey, acceptedVersions, citations, flips, lineDiff, majority, recommend, recommendAll, round, rung } from "./score.ts";

const key = (xs: [string, string, string[]][]) => new Map<string, Key>(xs.map(([id, outcome, sops]) => [id, { outcome, sops }]));
const run = (case_id: string, outcome: string, sop_sections: string[] = []) => ({ case_id, outcome, agent: { sop_sections } });

// Each test is a counterexample from the adversarial review of the comparison (Codex, Grok, Gemini).
describe("scoring the runs", () => {
  it("scores citations only on cases a rule decides, so a correct approval isn't a miss", () => {
    const k = key([["A", "approve", []], ["B", "escalate", ["4.4"]], ["C", "escalate", ["5.2"]]]);
    expect(citations([run("A", "approve", ["3.2", "3.3"]), run("B", "escalate", ["4.4"]), run("C", "escalate", ["5.3"])], k))
      .toEqual({ cited: 1, scored: 2, no_section: 1 });
  });

  it("takes the usual outcome as the majority, and none on a tie", () => {
    expect(majority(["escalate", "incomplete", "incomplete"])).toBe("incomplete");
    expect(majority(["escalate", "incomplete"])).toBeNull();
    expect(majority(["approve"])).toBe("approve");
  });

  it("sorts every rerun into one kind of flip or none", () => {
    const before = key([["right", "approve", []], ["wrong", "approve", []], ["calm", "approve", []], ["missed", "request_docs", ["3.4"]], ["already", "request_docs", ["3.4"]], ["unstable", "escalate", ["4.4"]]]);
    const after = key([["right", "request_docs", []], ["wrong", "request_docs", []], ["calm", "approve", []], ["missed", "incomplete", []], ["already", "incomplete", []], ["unstable", "escalate", ["4.4"]]]);
    // The agent's usual outcomes: "unstable" went escalate once and incomplete twice, so incomplete is usual.
    const usual = new Map([["right", "approve"], ["wrong", "approve"], ["calm", "approve"], ["missed", "request_docs"], ["already", "incomplete"], ["unstable", "incomplete"]]);
    const rerun = [run("right", "request_docs"), run("wrong", "decline"), run("calm", "escalate"), run("missed", "request_docs"), run("already", "incomplete"), run("unstable", "incomplete")];
    expect(flips(usual, rerun, before, after)).toEqual({ right: ["right"], wrong: ["wrong"], unexplained: ["calm"], missed: ["missed"], already: ["already"] });
  });

  it("counts a ladder rung's dangerous approvals, runs without a decision and unstable cases", () => {
    const k = key([["A", "approve", []], ["B", "escalate", ["4.4"]], ["C", "request_docs", ["3.4"]]]);
    const r = (case_id: string, outcome: string | null) => ({ case_id, outcome, usd: 0.01, ms: 2000 });
    expect(rung([r("A", "approve"), r("A", "approve"), r("B", "approve"), r("B", "escalate"), r("C", null), r("C", "request_docs")], k))
      .toEqual({ runs: 6, cases: 3, correct: 4, dangerous_approvals: 1, no_decision: 1, unstable_cases: 2, usd_per_case: 0.01, s_per_case: 2 });
  });

  it("scores a round case by case, and doesn't count an open fact the evidence system can't close", () => {
    const pending = "4.1 could still apply once sanctions for Nora Nakamura is known, and would mean decline.";
    const k = new Map<string, RoundKey>([["A", { outcome: "escalate", notes: [pending] }], ["B", { outcome: "escalate", notes: [] }], ["C", { outcome: "approve", notes: [] }]]);
    const r = (case_id: string, outcome: string | null, notes: string[] = []) => ({ case_id, outcome, stopped: outcome ? "submitted" : "max_turns", notes, usd: 0.001, turns: 4, evidence_calls: 2, ms: 5000 });
    // A stopped where the full facts are open too; B stopped with a fact it could have asked for; C ran out of turns once.
    const s = round([r("A", "escalate", [pending]), r("B", "escalate", [pending.replace("Nora Nakamura", "Kofi Vargas")]), r("C", "approve"), r("C", null)], k);
    expect([s.total, s.runs, s.correct, s.passed]).toEqual([3, 4, 2, 1]);
    expect(s.groups).toEqual([
      { cause: "Ended without a decision (max turns)", cases: ["C"] },
      { cause: "Submitted while 4.1 could still mean decline", cases: ["B"] },
    ]);
  });

  it("lists as worse only cases that passed both checks last round", () => {
    const k = new Map<string, RoundKey>([["A", { outcome: "approve", notes: [] }], ["B", { outcome: "approve", notes: [] }]]);
    const r = (case_id: string, outcome: string) => ({ case_id, outcome, stopped: "submitted", notes: [], usd: 0, turns: 3, evidence_calls: 2, ms: 5000 });
    expect(round([r("A", "escalate"), r("B", "escalate")], k, { correct: ["A"], complete: ["A", "B"] }).got_worse).toEqual(["A"]);
  });

  it("diffs two versions of the notes by line", () => {
    expect(lineDiff("Ask for owners.\nCheck once.", "Ask for owners.\n\nCheck again after each answer.")).toEqual({ removed: ["Check once."], added: ["Check again after each answer."] });
  });

  it("recommends a new version of the notes only for a gain beyond rerun noise, and never when something got worse", () => {
    const v1 = { version: 1, correct: 60, passed: 60, total: 60, got_worse: [], usd_per_case: 0.0011, turns_per_case: 4.1, evidence_calls_per_case: 2.2, s_per_case: 6.3 };
    // The round 2 we ran: the same scores, cost and turns within a few percent.
    expect(recommend(v1, { ...v1, version: 2, usd_per_case: 0.00108, turns_per_case: 4.05 }))
      .toEqual({ accept: false, text: "Keep v1: no gain on any measure (a change under 10%, or of 2 cases or fewer, is within rerun noise)." });
    expect(recommend(v1, { ...v1, version: 2, usd_per_case: 0.0009 }).text).toBe("Accept v2: cost down 18%, nothing got worse.");
    // Cheaper, but a case got worse: keep.
    expect(recommend(v1, { ...v1, version: 2, usd_per_case: 0.0005, passed: 59, got_worse: ["B-008"] }))
      .toEqual({ accept: false, text: "Keep v1: 1 fewer complete; B-008 got worse." });
  });

  // Counterexamples from Codex's and Grok's review of PR #33: a rise in cost or speed never kept the one in use, and
  // a drop that shows as 10% could be refused.
  it("keeps the one in use for a rise of 10% or more in cost or speed, and reads 10% the way the pane shows it", () => {
    const v1 = { version: 1, correct: 60, passed: 60, total: 60, got_worse: [], usd_per_case: 1, turns_per_case: 4, evidence_calls_per_case: 2, s_per_case: 10 };
    expect(recommend(v1, { ...v1, version: 2, usd_per_case: 0.5, turns_per_case: 4.8 }).text).toBe("Keep v1: turns up 20%.");
    expect(recommend(v1, { ...v1, version: 2, evidence_calls_per_case: 2.3, s_per_case: 6 }).text).toBe("Keep v1: evidence calls up 15%.");
    expect(recommend(v1, { ...v1, version: 2, usd_per_case: 2, s_per_case: 20, turns_per_case: 3.2 }).text).toBe("Keep v1: cost up 100%; time up 100%.");
    expect(recommend(v1, { ...v1, version: 2, usd_per_case: 0.9 }).text).toBe("Accept v2: cost down 10%, nothing got worse.");
    expect(recommend({ ...v1, usd_per_case: 0 }, { ...v1, version: 2, usd_per_case: 0.01, turns_per_case: 2 }).text).toBe("Keep v1: cost up from 0.");
    // One or two more cases is within noise; three is a gain. Any case fewer keeps.
    expect(recommend({ ...v1, correct: 57 }, { ...v1, version: 2, correct: 59 }).accept).toBe(false);
    expect(recommend({ ...v1, correct: 57 }, { ...v1, version: 2 }).text).toBe("Accept v2: 3 more correct, nothing got worse.");
    expect(recommend(v1, { ...v1, version: 2, correct: 59, usd_per_case: 0.5 }).text).toBe("Keep v1: 1 fewer correct.");
  });

  // Counterexample from Tenki's review of PR #33: got_worse counted against the round before, not the setup compared.
  it("compares each later setup with the best so far, and counts what got worse against that same setup", () => {
    const base = { total: 3, got_worse: [] as string[], usd_per_case: 0.03, turns_per_case: 4, evidence_calls_per_case: 2, s_per_case: 10 };
    const v1 = { ...base, skill_version: 1, correct: 2, passed: 2, lists: { correct: ["A", "B"], complete: ["A", "B"] } };
    // v2 loses A: kept, so v1 stays the best.
    const v2 = { ...base, skill_version: 2, correct: 1, passed: 1, got_worse: ["A"], lists: { correct: ["B"], complete: ["B"] } };
    // v3 still loses A but wins C, and is cheaper. Against v2, nothing got worse; against v1, A did.
    const v3 = { ...base, skill_version: 3, correct: 2, passed: 2, got_worse: [], usd_per_case: 0.001, lists: { correct: ["B", "C"], complete: ["B", "C"] } };
    const { rounds, best_version } = recommendAll([v1, v2, v3], 1);
    expect(rounds.map((r) => [r.skill_version, (r as { compared_to?: number }).compared_to, r.recommendation.accept, r.got_worse]))
      .toEqual([[1, undefined, false, []], [2, 1, false, ["A"]], [3, 1, false, ["A"]]]);
    expect(rounds[2].recommendation.text).toBe("Keep v1: A got worse.");
    expect(best_version).toBe(1);
    // A cheaper v2 that loses nothing becomes the best, and v3 is compared with it.
    const cheap = { ...v1, skill_version: 2, usd_per_case: 0.001 };
    const chain = recommendAll([v1, cheap, { ...v3, usd_per_case: 0.001 }], 1);
    expect(chain.rounds.map((r) => (r as { compared_to?: number }).compared_to)).toEqual([undefined, 1, 2]);
    expect(chain.best_version).toBe(2);
    // Rounds before the version in use say so.
    expect(recommendAll([v1, cheap], 2).rounds[0].recommendation.text).toBe("Before v2, the version in use.");
  });

  // Counterexamples from the adversarial review of PR #30 (Codex, Grok).
  it("reads a note the same whatever order its facts were asked in", () => {
    const ab = "4.1 could still apply once sanctions for Nora Nakamura and sanctions for Kofi Vargas is known, and would mean decline.";
    const ba = "4.1 could still apply once sanctions for Kofi Vargas and sanctions for Nora Nakamura is known, and would mean decline.";
    const k = new Map<string, RoundKey>([["A", { outcome: "incomplete", notes: [ab] }]]);
    const s = round([{ case_id: "A", outcome: "incomplete", stopped: "submitted", notes: [ba], usd: 0, turns: 4, evidence_calls: 2, ms: 1 }], k);
    expect([s.correct, s.passed, s.groups]).toEqual([1, 1, []]);
  });

  it("fails a run that missed an open note, has no final check, or never ran", () => {
    const pending = "4.1 could still apply once sanctions for Nora Nakamura is known, and would mean decline.";
    const k = new Map<string, RoundKey>([["A", { outcome: "escalate", notes: [pending] }], ["B", { outcome: "approve", notes: [] }], ["C", { outcome: "approve", notes: [] }]]);
    const r = (case_id: string, outcome: string, notes: string[] | null) => ({ case_id, outcome, stopped: "submitted", notes, usd: 0, turns: 4, evidence_calls: 2, ms: 1 });
    const s = round([r("A", "escalate", []), r("B", "approve", null)], k);
    expect([s.total, s.correct, s.passed]).toEqual([3, 2, 0]);
    expect(s.groups).toEqual([
      { cause: "Missed that 4.1 could still mean decline", cases: ["A"] },
      { cause: "No final Resolve check on the record", cases: ["B"] },
      { cause: "No run recorded", cases: ["C"] },
    ]);
  });

  it("counts an early decline as complete, since nothing left could change it", () => {
    const k = new Map<string, RoundKey>([["A", { outcome: "decline", notes: [] }]]);
    expect(round([{ case_id: "A", outcome: "decline", stopped: "submitted", notes: [], usd: 0, turns: 3, evidence_calls: 1, ms: 1 }], k).passed).toBe(1);
  });

  it("counts an acceptance only for the spec on screen and a version scored, and skips lines that don't parse", () => {
    const lines = ['{not json', '{"type":"accept_skill","version":2,"spec_version":1,"spec_hash":"abc"}', '{"type":"accept_skill","version":4,"spec_version":9}',
      '{"type":"accept_skill","version":3,"spec_version":1,"spec_hash":"stale"}', '{"type":"accept_skill","spec_version":1}'].join("\n");
    const v = (...ns: number[]) => ns.map((version) => ({ version, setup: `s${version}` }));
    expect(acceptedVersions(lines, { version: 1, spec_hash: "abc" }, v(1, 2, 3, 4))).toEqual([2]);
    expect(acceptedVersions(lines, { version: 1, spec_hash: "abc" }, v(1))).toEqual([]);
  });

  // Grok and Codex (PR #33): looser than the pane on the spec, and blind to renumbered versions.
  it("reads an acceptance as the pane does, and not for a setup the version no longer names", () => {
    const v = [{ version: 2, setup: "Haiku 5.5 low" }, { version: 3, setup: "Haiku 5.5 low · notes kyb-v2" }];
    const line = (x: object) => JSON.stringify({ type: "accept_skill", spec_version: 1, spec_hash: "abc", ...x });
    // A line without the spec's hash, or with no spec.json beside it, doesn't count.
    expect(acceptedVersions('{"type":"accept_skill","version":3,"spec_version":1}', { version: 1, spec_hash: "abc" }, v)).toEqual([]);
    expect(acceptedVersions(line({ version: 3 }), null, v)).toEqual([]);
    // v2 accepted when it named the notes setup that is now v3: not v2.
    expect(acceptedVersions(line({ version: 2, setup: "Haiku 5.5 low · notes kyb-v2" }), { version: 1, spec_hash: "abc" }, v)).toEqual([]);
    expect(acceptedVersions(line({ version: 2, setup: "Haiku 5.5 low" }), { version: 1, spec_hash: "abc" }, v)).toEqual([2]);
  });
});
