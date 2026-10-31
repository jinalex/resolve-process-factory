// Claude's question and options for a finding: the reply is parsed strictly, and each option's edit is checked
// before pnpm resolve works out what it would change.
import { describe, expect, it, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "../core/load.ts";
import { RUNS, type PaneFinding, buildPrompt, editsDoc, findingShown, mergeReplies, nextStep, optionProblems, parseReply, savedReply } from "./write-options.ts";
import { apiKey } from "./api-key.ts";
import { claudeCodeArgs } from "./propose-spec.ts";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { sha256 } from "./draft-spec.ts";
import { replyOf } from "./propose-spec.ts";

const spec = loadSpec("spec/expenses-v1.json");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const sop = read(spec.sop.file);
const receipt = spec.rules.find((r) => r.id === "receipt")!;
const reply = (x: unknown) => "Here it is.\n```json\n" + JSON.stringify(x) + "\n```";
const good = { question: "Return it, or wait for the receipt?", options: [
  { option: "Return it now", says: "4.1 returns the claim now.", edits: [] },
  { option: "Wait for the receipt", says: "4.1 returns a claim only when a receipt is missing.",
    edits: [{ op: "replace_rule", rule: { ...receipt, when: { some: "lines", where: { all: [{ fact: "amount_band", is: "75_or_more" }, { fact: "itemised_receipt", is: "no" }] } } } }] },
] };

describe("Claude's options for a finding", () => {
  it("parses the last json block", () => expect(parseReply(reply(good))).toEqual(good));

  it("refuses a reply that isn't a question with two options, each with a label, a sentence and edits", () => {
    expect(() => parseReply("no json")).toThrow();
    expect(() => parseReply(reply({ ...good, options: good.options.slice(0, 1) }))).toThrow(/at least two options/);
    expect(() => parseReply(reply({ ...good, options: [good.options[0], { option: "x", says: "y" }] }))).toThrow(/list of edits/);
    expect(() => parseReply(reply({ ...good, options: [good.options[0], good.options[0]] }))).toThrow(/same label/);
  });

  it("checks each edit loads and quotes the SOP", () => {
    expect(optionProblems(spec, good as never, sop)).toEqual([]);
    const bad = structuredClone(good);
    (bad.options[1].edits[0] as { rule: { text: string } }).rule.text = "Return claims without receipts.";
    bad.options[0].edits = [{ op: "remove_rule", id: "nope" }] as never;
    expect(optionProblems(spec, bad as never, sop)).toEqual([
      `"Return it now": The edit removes rule nope, which the spec doesn't have.`,
      `"Wait for the receipt": The edit rewrites which SOP words rule receipt comes from; a replaced rule keeps its section and text.`,
    ]);
  });

  it("builds the prompt from the code's own formats, filling every slot", () => {
    expect(editsDoc(read("core/spec-edit.ts"))).toMatch(/^export type SpecEdit/);
    expect(editsDoc(read("core/spec-edit.ts"))).not.toMatch(/Ruling/);
    const f = { id: "unknown-receipt", kind: "unknowns", rule_ids: ["receipt"], sop_refs: ["4.1", "2.2"], title: "t", example: "e", example_facts: [], explain: "x",
                question: null, options: [] };
    const p = buildPrompt(read("drafting/prompts/finding-options.md"), spec, f, sop, read("core/spec.ts"), read("core/spec-edit.ts"));
    expect(p).not.toMatch(/\{\{\w+\}\}/);
    expect(p).toContain('"id": "unknown-receipt"');
    expect(p).not.toContain('"question": null');            // what Claude is asked to write isn't in the finding it's shown
  });

  it("writes replies only into the spec.json for the spec they were asked about, onto findings that say the same", () => {
    const f = { id: "unknown-receipt", kind: "unknowns", rule_ids: ["receipt"], sop_refs: ["4.1", "2.2"], title: "t", example: "e", example_facts: [], explain: "x", question: null, options: [] };
    const now = () => ({ spec_hash: "h1", findings: [structuredClone(f)] });
    const merged = mergeReplies(now(), "h1", [{ f, reply: good as never }]);
    expect(merged.added).toEqual(["unknown-receipt"]);
    expect(merged.pane.findings[0]).toMatchObject({ question: good.question, options: ["Return it now", "Wait for the receipt"] });
    expect(() => mergeReplies(now(), "h0", [{ f, reply: good as never }])).toThrow(/rewritten for another spec/);
    const changed = now();
    changed.findings[0].explain = "Z3 now says something else.";
    expect(mergeReplies(changed, "h1", [{ f, reply: good as never }]).pane.findings[0].question).toBeNull();
    // A question someone else wrote meanwhile stays, and isn't counted as this run's.
    const asked = now();
    asked.findings[0].question = "Already asked?" as never;
    expect(mergeReplies(asked, "h1", [{ f, reply: good as never }])).toMatchObject({ added: [], pane: { findings: [{ question: "Already asked?" }] } });
  });
});

// Each saved call holds together offline: the prompt is the one hashed, the reply is the response's text, and the
// options it parses to still pass today's checks, so a stricter check or an edited run file shows up here.
const runs = readdirSync(RUNS).filter((f) => f.endsWith(".json"));
describe.runIf(runs.length)("saved option runs replay offline", () => {
  test.each(runs)("%s", (f) => {
    const run = JSON.parse(readFileSync(join(RUNS, f), "utf8"));
    expect(sha256(run.prompt)).toBe(run.prompt_sha256);
    expect(replyOf(run.response)).toBe(run.reply);
    expect(parseReply(run.reply)).toEqual(run.parsed);
    // A spec version a recorded run wrote is kept with its recording, not in spec/.
    const s = loadSpec(existsSync(join(ROOT, run.spec_file)) ? run.spec_file : join("replay/recording", run.spec_file));
    expect(optionProblems(s, run.parsed, read(s.sop.file))).toEqual(run.problems);
  });
});

describe("a first run", () => {
  it("uses the newest saved reply that was asked exactly what would be asked now", () => {
    const template = "Finding:\n{{FINDING}}\nSOP:\n{{SOP}}";
    const build = (x: object, sopText = "the SOP") => template.replace("{{FINDING}}", JSON.stringify(x, null, 2)).replace("{{SOP}}", sopText);
    const f = { id: "f1", kind: "unknowns", title: "t", explain: "x", sop_refs: ["3.4"], rule_ids: ["r"], proof: { ms: 9 } } as never;
    const runs = mkdtempSync(join(tmpdir(), "options-"));
    const run = (id: string, extra: object, shown: object = { ...(f as object), proof: { ms: 120 } }) => writeFileSync(join(runs, `${id}.json`),
      JSON.stringify({ id, finding: "f1", spec_hash: "h1", prompt: build(shown), parsed: good, problems: [], ...extra }));
    run("old", { created: "2026-10-01" });
    run("new", { created: "2026-10-02" });                                       // Z3 took longer then: still the same question
    run("newer-other-spec", { created: "2026-10-03", spec_hash: "h2" });
    run("newer-other-finding", { created: "2026-10-04" }, { ...(f as object), explain: "Z3 now says something else." });
    run("newer-other-sop", { created: "2026-10-05", prompt: build(f, "an SOP since edited") });
    run("newer-unparsed", { created: "2026-10-06", parsed: null });
    run("newer-with-problems", { created: "2026-10-07", problems: ["x"] });
    run("newer-unchecked", { created: "2026-10-08", problems: undefined });
    run("undated", {});
    const pick = (runsDir = runs) => savedReply(f, "h1", (x) => build(x), template, runsDir);
    expect(pick()?.id).toBe("new");
    expect(savedReply({ ...(f as object), id: "f2" } as never, "h1", (x) => build(x), template, runs)).toBeNull();
    expect(pick(join(runs, "none"))).toBeNull();
    expect(findingShown(template, "not this template")).toBeNull();
  });

  // The demo's first step: pnpm resolve on v1, then write-options looks for a saved reply to each finding as it would.
  it("has a saved reply for every finding on KYB's v1, so the demo needs no key", async () => {
    const { writePane } = await import("../packs/kyb/pane.ts");
    const { specHash } = await import("../core/pane.ts");
    const kyb = loadSpec("spec/kyb-v1.json"), out = mkdtempSync(join(tmpdir(), "first-run-")), sopText = read(kyb.sop.file);
    const template = read("drafting/prompts/finding-options.md");
    const { findings } = await writePane({ spec: JSON.parse(read("spec/kyb-v1.json")), out });
    expect(findings.length).toBeGreaterThan(0);
    const build = (x: PaneFinding) => buildPrompt(template, kyb, x, sopText, read("core/spec.ts"), read("core/spec-edit.ts"));
    for (const f of findings) {
      const saved = savedReply(f as never, specHash(kyb), build, template);
      expect(saved, f.id).not.toBeNull();
      expect(optionProblems(kyb, saved!.reply, sopText)).toEqual([]);
    }
  }, 300_000);

  it("suggests pnpm resolve only when there are new options for it", () => {
    expect(nextStep(0, 3)).toMatch(/^Nothing was written/);
    expect(nextStep(0, 3)).not.toMatch(/pnpm resolve/);
    expect(nextStep(3, 0)).toBe("Run pnpm resolve to work out what each new option would change.");
    expect(nextStep(2, 1)).toMatch(/1 finding got no options; run pnpm write-options again to retry it/);
    expect(nextStep(0, 0)).toBe("");
  });

  it("takes Resolve's own key first, then the standard one", () => {
    const keep = { r: process.env.RESOLVE_ANTHROPIC_API_KEY, a: process.env.ANTHROPIC_API_KEY };
    try {
      delete process.env.RESOLVE_ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
      expect(apiKey()).toBeUndefined();
      process.env.ANTHROPIC_API_KEY = "a";
      expect(apiKey()).toBe("a");
      process.env.RESOLVE_ANTHROPIC_API_KEY = "  ";                                     // blank is not set
      expect(apiKey()).toBe("a");
      process.env.RESOLVE_ANTHROPIC_API_KEY = "r";
      expect(apiKey()).toBe("r");
    } finally {
      for (const [k, v] of [["RESOLVE_ANTHROPIC_API_KEY", keep.r], ["ANTHROPIC_API_KEY", keep.a]] as const) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
  });

  it("asks Claude Code with no tools and no saved session", () => {
    const a = claudeCodeArgs("claude-opus-5-5", "high");
    expect(a.slice(a.indexOf("--tools"), a.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
    expect(a).toContain("--no-session-persistence");
    expect(a).toEqual(expect.arrayContaining(["--safe-mode", "--strict-mcp-config"]));   // no CLAUDE.md, hooks, plugins or MCP
  });

  it("reads the reply from a claude -p result as from an API message", () => {
    expect(replyOf({ result: "Here it is." })).toBe("Here it is.");
    expect(replyOf({ content: [{ type: "text", text: "Here it is." }] } as never)).toBe("Here it is.");
  });
});
