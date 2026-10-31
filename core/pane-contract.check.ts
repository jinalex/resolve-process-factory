// Compile-time checks on the pane's file contract (mod/resolve/types/files.d.ts), run by `pnpm typecheck`. Each
// expected-error directive below marks a shape the contract must refuse: if the contract starts accepting it, tsc fails
// on the unused directive. Nothing here runs.
import type { CaseEntry, FindingEntry, ImpactEntry, RoundEntry, SpecJson } from "../mod/resolve/types/files.d.ts";
import type { Impact } from "./impact.ts";

const results = { keeps_rules: false, resolves: true, new_findings: [], changes: [], searched_items_per_list: null, flips: [], matches_past: null, past_decided: 0 };

// An option Resolve worked out has every result; one it couldn't try names at least one problem.
export const checked: ImpactEntry = { option: "A", problems: [], ...results };
export const failed: ImpactEntry = { option: "A", problems: ["The edit doesn't load."], ...results };
export const untried: ImpactEntry = { option: "A", problems: ["Claude wrote no edit for this option."] };
// @ts-expect-error an option with no results and no problem says nothing
export const empty: ImpactEntry = { option: "A", problems: [] };
// @ts-expect-error a result with a field missing isn't a worked-out option
export const partial: ImpactEntry = { option: "A", problems: [], keeps_rules: false, resolves: true };

// What core/impact.ts works out is a full result.
export const fromCore = (i: Impact): ImpactEntry => i;

// A finding's answer is a choice and when it was made.
// @ts-expect-error a choice is text
export const answer: FindingEntry["answer"] = { choice: 1, at: "2026-10-30" };

// spec.json's outcomes are names, most severe first.
// @ts-expect-error order is a list of outcome names
export const order: SpecJson["order"] = "decline";

// A case names who decided it in words.
// @ts-expect-error decided_by is the field's name
export const kase: CaseEntry = { id: "EX-1", name: "n", outcome: "approve", decidedBy: "No rule stops approval.", missing: [], facts: [] };

// A round's notes diff is a list of groups of lines.
// @ts-expect-error each group says which lines were removed and added
export const diff: RoundEntry["skill_diff"] = [{ group: "g", lines: [] }];
