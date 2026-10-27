# Design principles

The rules we hold to when a new question comes up. Each one is here because a specific decision depended on it; see [DECISIONS.md](DECISIONS.md).

## What Resolve trusts

**1. Unknown is not "no".**
A fact the agent could not find stays unknown. Resolve never approves on an unknown, and filling in an unknown never turns a decided answer into a different one, except "incomplete". This is one of the engine facts proven in Dafny, so it holds for every SOP, not just the ones we tested.

**2. The agent reports facts; Resolve draws conclusions.**
The agent hands over raw facts and a proposed outcome. Anything that follows from the facts, such as "ownership is complete" or "the outcome follows from the SOP", is computed by Resolve and never taken from the agent.

**3. Every fact has a source a person can open.**
Each fact cites where it came from and quotes it exactly, and Resolve checks the quote is really there. Every web search is recorded with its terms, date and sources. A fact without provenance is treated as missing.

**4. Reasons, not scores.**
When a call needs judgment, the agent gives typed reasons that rules can check against the SOP. A confidence number can help route work inside the system, but it never decides what a person sees, because nobody can audit it.

## Who changes what

**5. The agent never edits its own checker.**
The improve loop can change the review skill, meaning how the agent works. The spec and the checker, meaning what counts as correct, change only when a person approves.

**6. Policy owners review cases, not code.**
Everything a compliance person sees is a plain sentence with SOP section numbers. No rule IDs, no solver output. A rule change is shown as the cases it would flip.

**7. Past decisions are evidence, not ground truth.**
When a change disagrees with a past case, ask the person who was right instead of protecting the old answer. Teams make mistakes, and a gate that trusts every label turns those mistakes into rules.

**8. A person sends.**
Buttons in the pane draft a message to Claude; they do not send it.

## How we check and measure

**9. Cheap checks on every change, proofs once.**
Z3 runs on every SOP and every edit, because it is fast and returns a concrete counterexample. Proofs that cost real effort (Dafny) are spent once, on Resolve's own engine, where they cover every SOP at the same time.

**10. Measure, don't stage.**
Cases are frozen before the first run and results are reported whatever they show. Only the documents are synthetic. We don't plant failures for the demo to catch; if the agent gets a case right, that is a result too.

**11. Safety is a floor, cost is the story.**
No rise in dangerous approvals is the firm bar. The improvement we report is getting the same correct outcomes for less cost or time.

## How it ships

**12. One core, two surfaces.**
The mod and the hosted page import the same logic. The page replays recorded runs and says so.

**13. Build only what the demo needs.**
Nested processes (such as adjudicating a sanctions hit) are mocked as the output of an upstream step, not built. If a piece doesn't change a number we report or a screen we show, it waits.
