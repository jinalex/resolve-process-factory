# Design principles

The rules we hold to when a new question comes up. Each one is here because a specific decision depended on it; see [DECISIONS.md](DECISIONS.md).

## What Resolve trusts

**1. Unknown is not "no".**
A fact the agent could not find stays unknown. Resolve never approves on an unknown, and filling in an unknown never turns a decided answer into a different one, except "incomplete". A missing value or an empty list of people counts as unknown too. This is one of the engine facts we plan to prove in Dafny, so that it holds for every SOP, not just the ones we tested.

**2. The agent reports facts; Resolve draws conclusions.**
The agent hands over raw facts and a proposed outcome. Anything that follows from the facts, such as "ownership is complete" or "the outcome follows from the SOP", is computed by Resolve and never taken from the agent.

**3. Every fact has a source a person can open.**
Each fact cites where it came from and quotes it exactly, and Resolve checks the quote is really there. Every web search is recorded with its terms, date and sources. A fact without provenance is treated as missing.

**4. Reasons, not scores.**
When a call needs judgment, the agent gives typed reasons that rules can check against the SOP. A confidence number can help route work inside the system, but it never decides what a person sees, because nobody can audit it.

**5. Model outputs only propose.**
Anything a model produces (rules from the SOP, facts, judgment calls) passes through a small checked core or a person before it counts. We claim that every model output is checked, not that the models are verified.

## Who changes what

**6. The agent never edits its own checker.**
The improve loop can change the review skill, meaning how the agent works. The spec and the checker, meaning what counts as correct, change only when a person approves.

**7. Policy owners review cases, not code.**
Everything a compliance person sees is a plain sentence with SOP section numbers. No rule IDs, no solver output. A rule change is shown as the cases it would flip.

**8. Past decisions are evidence, not ground truth.**
When a change disagrees with a past case, ask the person who was right instead of protecting the old answer. Teams make mistakes, and a gate that trusts every label turns those mistakes into rules.

**9. A person sends.**
Buttons in the pane draft a message to Claude; they do not send it.

## How we check and measure

**10. Cheap checks on every change, proofs once.**
Z3 runs on every SOP and every edit, because it is fast and returns a concrete counterexample. Proofs that cost real effort (Dafny) are spent once, on Resolve's own engine, where they cover every SOP at the same time.

**11. Measure, don't stage.**
Cases are frozen before the first run and results are reported whatever they show. Only the documents are synthetic. We don't plant failures for the demo to catch; if the agent gets a case right, that is a result too.

**12. Safety is a floor, cost is the story.**
No rise in dangerous approvals is the firm bar. The improvement we report is getting the same correct outcomes for less cost or time.

## How it ships

**13. One core, two surfaces.**
The mod and the hosted page import the same logic. The page replays recorded runs and says so.

**14. Keep the scope, build in layers.**
Each layer ends with something that works, so a late layer can slip without breaking the demo. Nested processes (such as adjudicating a sanctions hit) are mocked as the output of an upstream step, not built.

## Where logic lives

**15. Rules decide; code only computes.**
Every decision the SOP makes is a rule in the spec, where Z3 checks it and a person can read it next to its SOP sentence. That includes who counts, such as which owners must be identified under 3.3, and not only which outcome a case gets. Pack code only works out the facts the rules need, with general building blocks: arithmetic such as an owner's share through chains of companies, dates, reading documents, and mapping the case's words onto the spec's values through a table in the spec. Each computed fact names its SOP section and has a reference test that doesn't share its code, such as the Dafny model for ownership, because Z3 takes computed facts on trust. A value pack code can't map onto one of the spec's values is unknown, never a guess. A review rule follows: if a line of pack code picks an outcome or decides who counts, it belongs in the spec.
