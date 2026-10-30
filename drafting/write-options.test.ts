// Claude's question and options for a finding: the reply is parsed strictly, and each option's edit is checked
// before pnpm resolve works out what it would change.
import { describe, expect, it, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "../core/load.ts";
import { RUNS, buildPrompt, editsDoc, mergeReplies, nextStep, optionProblems, parseReply, savedReply } from "./write-options.ts";
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
    expect(merged.findings[0]).toMatchObject({ question: good.question, options: ["Return it now", "Wait for the receipt"] });
    expect(() => mergeReplies(now(), "h0", [{ f, reply: good as never }])).toThrow(/rewritten for another spec/);
    const changed = now();
    changed.findings[0].explain = "Z3 now says something else.";
    expect(mergeReplies(changed, "h1", [{ f, reply: good as never }]).findings[0].question).toBeNull();
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
  it("uses the newest saved reply for the same spec and finding that parsed and passed its checks", () => {
    const runs = mkdtempSync(join(tmpdir(), "options-"));
    const run = (id: string, created: string, extra: object) => writeFileSync(join(runs, `${id}.json`),
      JSON.stringify({ id, created, finding: "f1", spec_hash: "h1", parsed: good, problems: [], ...extra }));
    run("old", "2026-10-01", {});
    run("new", "2026-10-02", {});
    run("newer-other-spec", "2026-10-03", { spec_hash: "h2" });
    run("newer-unparsed", "2026-10-04", { parsed: null });
    run("newer-with-problems", "2026-10-05", { problems: ["x"] });
    expect(savedReply("h1", "f1", runs)?.id).toBe("new");
    expect(savedReply("h1", "f2", runs)).toBeNull();
    expect(savedReply("h1", "f1", join(runs, "none"))).toBeNull();
  });

  it("has a saved reply for every finding on KYB's v1, so the demo needs no key", async () => {
    const { specHash } = await import("../core/pane.ts");
    const hash = specHash(loadSpec("spec/kyb-v1.json"));
    for (const f of ["dead-msb-licensed", "unknown-id-verified", "unused-licence_verified"]) expect(savedReply(hash, f)).not.toBeNull();
  });

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
  });
});
