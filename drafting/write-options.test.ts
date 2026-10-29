// Claude's question and options for a finding: the reply is parsed strictly, and each option's edit is checked
// before pnpm resolve works out what it would change.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadSpec } from "../core/load.ts";
import { buildPrompt, editsDoc, optionProblems, parseReply } from "./write-options.ts";

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
      `"Wait for the receipt": Rule receipt quotes words that aren't in 4.1: "Return claims without receipts."`,
    ]);
  });

  it("builds the prompt from the code's own formats, filling every slot", () => {
    expect(editsDoc(read("core/spec-edit.ts"))).toMatch(/^export type SpecEdit/);
    expect(editsDoc(read("core/spec-edit.ts"))).not.toMatch(/Ruling/);
    const f = { id: "unknown-receipt", kind: "unknowns", rule_ids: ["receipt"], sop_refs: ["4.1", "2.2"], title: "t", example: "e", example_facts: [], explain: "x",
                question: null, options: [] };
    const p = buildPrompt(read("prompts/finding-options.md"), spec, f, sop, read("core/spec.ts"), read("core/spec-edit.ts"));
    expect(p).not.toMatch(/\{\{\w+\}\}/);
    expect(p).toContain('"id": "unknown-receipt"');
    expect(p).not.toContain('"question": null');            // what Claude is asked to write isn't in the finding it's shown
  });
});
