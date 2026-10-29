import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { kybSpec, loadExamples } from "../packs/kyb/examples.ts";
import { KybWorld } from "../packs/kyb/evidence-mock.ts";
import { promptSetup, runCase, resolveOnly } from "./agent.ts";

// A stand-in for the API that plays back a script of tool calls, so the loop can be tested without model calls.
function scripted(turns: ({ name: string; input: unknown }[] | "refusal")[]) {
  const seen: unknown[] = [];
  let i = 0;
  const client = { beta: { messages: { create: async (body: { messages: unknown[]; tools: { name: string }[] }) => {
    seen.push({ tools: body.tools.map((t) => t.name), messages: structuredClone(body.messages) });
    const turn = turns[i++] ?? [];
    const calls = turn === "refusal" ? [] : turn;
    return {
      model: "scripted", stop_reason: turn === "refusal" ? "refusal" : calls.length ? "tool_use" : "end_turn",
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      content: calls.map((c, k) => ({ type: "tool_use", id: `t${i}-${k}`, name: c.name, input: c.input })),
    };
  } } } } as unknown as Anthropic;
  return { client, seen };
}
const opt = { model: "scripted", effort: "high" as const, maxTurns: 6, sop: "SOP" };
const decide = (outcome: string) => ({ name: "submit_decision", input: { outcome, sop_sections: [], reasons: "", still_needed: [] } });

describe("the case runner", () => {
  const spec = kybSpec();
  const ex5 = loadExamples().find((e) => e.case_id === "EX-5")!;

  it("agentic review: the outcome is the agent's, whatever the rules say", async () => {
    const { client, seen } = scripted([[{ name: "get_evidence", input: { requests: ["entity.country"] } }], [decide("approve")]]);
    const rec = await runCase(client, new KybWorld("EX-5", ex5.facts, spec), "agentic", "e2e", opt);
    expect([rec.outcome, rec.stopped, rec.evidence_calls, rec.evidence_requests, rec.resolve_checks]).toEqual(["approve", "submitted", 1, 1, 0]);
    expect((seen[0] as { tools: string[] }).tools).toEqual(["get_evidence", "submit_decision"]);
  });

  it("with Resolve: the outcome is Resolve's on what was gathered, not the agent's proposal", async () => {
    const { client, seen } = scripted([
      [{ name: "get_evidence", input: { requests: ["entity.country", "ownership"] } }],
      [{ name: "check_with_resolve", input: {} }],
      [decide("approve")],
    ]);
    const rec = await runCase(client, new KybWorld("EX-5", ex5.facts, spec), "resolve", "e2e", opt);
    expect(rec.agent?.outcome).toBe("approve");
    expect(rec.outcome).toBe("incomplete");                 // residence never asked, so 6.1 might still apply
    expect(rec.resolve?.still_needed.join(" ")).toMatch(/6\.1/);
    expect((seen[0] as { tools: string[] }).tools).toEqual(["get_evidence", "check_with_resolve", "submit_decision"]);
  });

  it("at the facts level the agent gets every fact up front and no evidence tool", async () => {
    const { client, seen } = scripted([[decide("decline")]]);
    const rec = await runCase(client, new KybWorld("EX-5", ex5.facts, spec), "agentic", "facts", opt);
    const first = (seen[0] as { tools: string[]; messages: { content: string }[] });
    expect(first.tools).toEqual(["submit_decision"]);
    expect(first.messages[0].content).toMatch(/reviewed on 2026-10-27/);
    expect(first.messages[0].content).toMatch(/"person:Dariush Karimi.residence",\s*"value": "IR"/);
    expect(rec.outcome).toBe("decline");
  });

  it("stops at the turn limit without a decision", async () => {
    const { client } = scripted([]);
    const rec = await runCase(client, new KybWorld("EX-5", ex5.facts, spec), "agentic", "e2e", { ...opt, maxTurns: 3 });
    expect([rec.outcome, rec.stopped, rec.turns]).toEqual([null, "max_turns", 3]);
  });

  it("Resolve alone needs no model", () => {
    expect(resolveOnly(new KybWorld("EX-5", ex5.facts, spec)).outcome).toBe("decline");
  });

  // Found in the adversarial review (Codex, Gemini): the Resolve arm got an outcome even when the agent never submitted.
  it("gives neither arm an outcome without a submit, and counts the refused turn", async () => {
    for (const arm of ["agentic", "resolve"] as const) {
      const { client } = scripted([[{ name: "get_evidence", input: { requests: ["entity.country"] } }], "refusal"]);
      const rec = await runCase(client, new KybWorld("EX-5", ex5.facts, spec), arm, "e2e", opt);
      expect([arm, rec.outcome, rec.stopped, rec.turns]).toEqual([arm, null, "refusal", 2]);
      if (arm === "resolve") expect(rec.resolve?.outcome).toBe("incomplete"); // Resolve's last check is still on the record
    }
  });

  it("takes a decision only on its own, after the agent has read the other results", async () => {
    const { client, seen } = scripted([
      [{ name: "get_evidence", input: { requests: ["entity.country"] } }, decide("approve")],
      [decide("decline")],
    ]);
    const rec = await runCase(client, new KybWorld("EX-5", ex5.facts, spec), "agentic", "e2e", opt);
    expect([rec.outcome, rec.turns, rec.evidence_calls]).toEqual(["decline", 2, 1]);
    expect(JSON.stringify((seen[1] as { messages: unknown[] }).messages.at(-1))).toMatch(/on its own/);
  });

  it("refuses a tool the arm or level doesn't offer", async () => {
    const { client } = scripted([[{ name: "get_evidence", input: { requests: ["entity.country"] } }, { name: "check_with_resolve", input: {} }], [decide("decline")]]);
    const rec = await runCase(client, new KybWorld("EX-5", ex5.facts, spec), "agentic", "facts", opt);
    expect([rec.outcome, rec.evidence_calls, rec.resolve_checks]).toEqual(["decline", 0, 0]);
  });

  it("records a hash of the prompt and tools, which changes with the SOP", async () => {
    const world = new KybWorld("EX-5", ex5.facts, spec);
    const { client } = scripted([[decide("decline")]]);
    const rec = await runCase(client, world, "agentic", "facts", opt);
    expect(rec.prompt_sha256).toBe(promptSetup(world, "agentic", "facts", "SOP").sha256);
    expect(promptSetup(world, "agentic", "facts", "SOP v2").sha256).not.toBe(rec.prompt_sha256);
  });
});
