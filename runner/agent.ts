// The case runner: one agent, run headless through the Anthropic API, that works a case with the evidence system.
// It runs in two arms that differ only in where the decision is made:
//   agentic review   the agent reads the SOP, gathers evidence, and decides the outcome itself;
//   agentic + Resolve the same agent gathers the same evidence, but Resolve decides from the facts gathered and
//                     says which facts are still missing; the agent goes back for them until it's done.
// And at two levels: "facts" hands the agent every fact up front, so only the decision step differs; "e2e" starts
// with nothing, so the agent must also work out what to ask for. Every call is recorded for exact replay.
import Anthropic from "@anthropic-ai/sdk";

export type Arm = "agentic" | "resolve";
export type Level = "facts" | "e2e";
export type Answer = { request: string; value: unknown; source: string };
export type Check = { outcome: string; decided_by: { sop: string; rule: string }[]; still_needed: string[]; notes: string[] };

// What the runner needs from a domain: how to ask the evidence system, and Resolve's check on what's been gathered.
export interface CaseWorld {
  readonly id: string;
  readonly reviewDate: string;               // the date the case is reviewed on, which the SOP's ages count to
  readonly requests: string;                 // how to ask, for the agent's instructions
  readonly outcomes: string[];               // the spec's outcomes, most severe first
  get(requests: string[]): Answer[];
  all(): Answer[];
  check(): Check;                            // Resolve on the evidence gathered so far
}

// `skill` is the review skill: the team's own notes on how to work a case, which the improve loop rewrites.
export type Options = { model: string; effort: "low" | "medium" | "high" | "xhigh" | "max"; maxTurns: number; sop: string; skill?: string };
export type Usage = { input: number; output: number; cache_read: number; cache_write: number };
export type Decision = { outcome: string; sop_sections: string[]; reasons: string; still_needed: string[] };
export type RunRecord = {
  case_id: string; arm: Arm; level: Level; model: string; effort: string; served_by: string[];
  ms: number; turns: number; usage: Usage;
  evidence_calls: number; evidence_requests: number; resolve_checks: number;
  agent: Decision | null;      // what the agent decided (agentic) or proposed (resolve)
  outcome: string | null;      // the arm's outcome: the agent's (agentic) or Resolve's (resolve)
  resolve: Check | null;       // Resolve's last check (resolve arm)
  stopped: string;             // "submitted", or why the run ended without a decision
  transcript: unknown[];
};

const getEvidence = (): Anthropic.Beta.BetaTool => ({
  name: "get_evidence", strict: true,
  description: "Ask the evidence system for facts about this case. Ask for several at once when you can.",
  input_schema: { type: "object", additionalProperties: false, required: ["requests"],
    properties: { requests: { type: "array", items: { type: "string" }, description: "Requests in the grammar from the instructions." } } },
});
const checkWithResolve: Anthropic.Beta.BetaTool = {
  name: "check_with_resolve", strict: true,
  description: "Hand Resolve the evidence gathered so far. Resolve applies the approved rules and returns the outcome they give, the SOP sections behind it, and the facts still missing that could change it.",
  input_schema: { type: "object", additionalProperties: false, required: [], properties: {} },
};
const submit = (outcomes: string[]): Anthropic.Beta.BetaTool => ({
  name: "submit_decision", strict: true,
  description: "Finish the case. Call it once, last.",
  input_schema: { type: "object", additionalProperties: false, required: ["outcome", "sop_sections", "reasons", "still_needed"],
    properties: {
      outcome: { type: "string", enum: outcomes },
      sop_sections: { type: "array", items: { type: "string" }, description: "The SOP sections that decide the outcome, e.g. \"4.3\"." },
      reasons: { type: "string", description: "Why, in two or three sentences." },
      still_needed: { type: "array", items: { type: "string" }, description: "Facts you would still need, if any." },
    } },
});

function instructions(world: CaseWorld, arm: Arm, level: Level, sop: string, skill = ""): string {
  const role = arm === "agentic"
    ? "You are an analyst reviewing one case under the SOP below. Decide the case's outcome exactly as the SOP says."
    : "You are an analyst working one case under the SOP below. Resolve, a checker that applies the team's approved rules, decides the outcome; your job is to gather the evidence it needs. Call check_with_resolve whenever you think the evidence is enough; it tells you which facts are still missing. When nothing more can be gathered, or Resolve needs nothing more, submit the outcome Resolve gave.";
  const gather = level === "e2e"
    ? `Gather the evidence with get_evidence. You start knowing only the case ID and the review date. ${world.requests}`
    : "Every fact the evidence system holds about the case is in the first message; there is nothing more to ask for.";
  const notes = skill ? `\n\n<review_skill>\n${skill}\n</review_skill>` : "";
  return `${role}\n\n${gather}\n\nFinish by calling submit_decision with one of: ${world.outcomes.join(", ")}.\n\n<sop>\n${sop}\n</sop>${notes}`;
}

export async function runCase(client: Anthropic, world: CaseWorld, arm: Arm, level: Level, opt: Options): Promise<RunRecord> {
  const t0 = Date.now();
  const tools = [...(level === "e2e" ? [getEvidence()] : []), ...(arm === "resolve" ? [checkWithResolve] : []), submit(world.outcomes)];
  const first = level === "facts"
    ? `Case ${world.id}, reviewed on ${world.reviewDate}. The evidence system's answers:\n${JSON.stringify(world.all(), null, 1)}`
    : `Case ${world.id}, reviewed on ${world.reviewDate}.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: first }];
  const rec: RunRecord = {
    case_id: world.id, arm, level, model: opt.model, effort: opt.effort, served_by: [], ms: 0, turns: 0,
    usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    evidence_calls: 0, evidence_requests: 0, resolve_checks: 0, agent: null, outcome: null, resolve: null, stopped: "max_turns", transcript: [],
  };
  const system: Anthropic.Beta.BetaTextBlockParam[] = [{ type: "text", text: instructions(world, arm, level, opt.sop, opt.skill), cache_control: { type: "ephemeral" } }];

  for (; rec.turns < opt.maxTurns; rec.turns++) {
    const res = await client.beta.messages.create({
      model: opt.model, max_tokens: 16000, system, tools, messages,
      output_config: { effort: opt.effort },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    rec.served_by.push(res.model);
    rec.usage.input += res.usage.input_tokens; rec.usage.output += res.usage.output_tokens;
    rec.usage.cache_read += res.usage.cache_read_input_tokens ?? 0; rec.usage.cache_write += res.usage.cache_creation_input_tokens ?? 0;
    messages.push({ role: "assistant", content: res.content });
    if (res.stop_reason === "refusal") { rec.stopped = "refusal"; break; }
    if (res.stop_reason === "pause_turn") continue;
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (!calls.length) {
      messages.push({ role: "user", content: "Finish by calling submit_decision." });
      continue;
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = call.input as Record<string, unknown>;
      if (call.name === "get_evidence") {
        const reqs = Array.isArray(input.requests) ? input.requests.map(String) : [];
        rec.evidence_calls++; rec.evidence_requests += reqs.length;
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(world.get(reqs)) });
      } else if (call.name === "check_with_resolve") {
        rec.resolve_checks++; rec.resolve = world.check();
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(rec.resolve) });
      } else if (call.name === "submit_decision") {
        rec.agent = input as unknown as Decision;
        results.push({ type: "tool_result", tool_use_id: call.id, content: "Recorded." });
      } else {
        results.push({ type: "tool_result", tool_use_id: call.id, content: `No tool named ${call.name}.`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
    if (rec.agent) { rec.stopped = "submitted"; rec.turns++; break; }
  }
  // The arm's outcome. In the Resolve arm it is always Resolve's, on everything gathered by the end.
  if (arm === "resolve") { rec.resolve = world.check(); rec.outcome = rec.resolve.outcome; }
  else rec.outcome = rec.agent?.outcome ?? null;
  rec.ms = Date.now() - t0;
  rec.transcript = messages;
  return rec;
}

// Resolve alone at the facts level: no agent, just the rules on every fact. Milliseconds, no model calls.
export function resolveOnly(world: CaseWorld): RunRecord {
  const t0 = performance.now();
  const asked = world.all().length;
  const check = world.check();
  return {
    case_id: world.id, arm: "resolve", level: "facts", model: "none", effort: "none", served_by: [],
    ms: performance.now() - t0, turns: 0, usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    evidence_calls: 1, evidence_requests: asked, resolve_checks: 1, agent: null, outcome: check.outcome, resolve: check,
    stopped: "submitted", transcript: [],
  };
}
