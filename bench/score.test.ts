import { describe, expect, it } from "vitest";
import { type Key, type RoundKey, citations, flips, lineDiff, majority, round, rung } from "./score.ts";

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
    const r = (case_id: string, outcome: string | null, notes: string[] = []) => ({ case_id, outcome, stopped: outcome ? "submitted" : "max_turns", notes, usd: 0.001, turns: 4 });
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
    const r = (case_id: string, outcome: string) => ({ case_id, outcome, stopped: "submitted", notes: [], usd: 0, turns: 3 });
    expect(round([r("A", "escalate"), r("B", "escalate")], k, { correct: ["A"], complete: ["A", "B"] }).got_worse).toEqual(["A"]);
  });

  it("diffs two versions of the notes by line", () => {
    expect(lineDiff("Ask for owners.\nCheck once.", "Ask for owners.\n\nCheck again after each answer.")).toEqual({ removed: ["Check once."], added: ["Check again after each answer."] });
  });
});
