import { describe, expect, it } from "vitest";
import { type Key, citations, flips, majority } from "./score.ts";

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
});
