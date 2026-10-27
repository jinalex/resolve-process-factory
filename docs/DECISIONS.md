# Decisions

What we decided, why, and what we gave up. Newest decisions are added at the end of each section. Alternatives we looked at and dropped are in [NOT-BUILT.md](NOT-BUILT.md); the rules these decisions follow are in [PRINCIPLES.md](PRINCIPLES.md).

## Direction (2026-10-26)

**Demo domain: KYB beneficial-ownership review, not transaction monitoring.**
The first spike reviewed transaction-monitoring alerts. Each alert was about 18 precomputed fields, so the hard part of real alert review, gathering the information, was skipped. With clean fields, Opus prompted with the reviewer's notes reached 99.3% on held-out alerts, against 96.3% for the corrected rule set. Rules did not win on accuracy, and a demo built on that would not hold up. KYB review is mostly evidence gathering, and the evidence has checkable obligations: shares should add to 100%, and no unidentified person may still be able to own 25% or more. The TM spike is dropped entirely, not kept as a backup number.

**What Resolve checks: the agent's case file.**
The case file has three layers. Facts are gathered by the agent and cannot be proven, only sourced and backtested. Evidence obligations are formal (for example, ownership completeness). Decision logic is formal. A fact that is unknown is never treated as "no". Short version: a lint for whether the right evidence was collected, and for checking that evidence against the rules.

**Z3 for each SOP, Dafny once for the engine.**
We wrote one KYB SOP in Z3, Dafny, Lean and Bend (`experiments/formal-compare/`). Z3 finds counterexamples and version diffs in seconds, which is what a reviewer needs for each SOP and each change, but it cannot prove a claim for any number of owners. Dafny proved the unbounded ownership facts with one or two hint lines. Lean worked but took the most effort and gives no counterexamples by default. So: Z3 runs on every SOP and every change; Dafny proves a few facts about Resolve's own engine once. AWS Cedar is built the same way (a proof of the compiler done once, a solver run per policy).

Engine facts to prove once in Dafny:
1. The ownership completeness check is sound for any number of owners and any chain depth.
2. For any SOP, Resolve never approves on an unknown, and an answer given with unknowns does not change once they are filled in (unless it was "incomplete").
3. There is one outcome regardless of rule order.
4. The runtime evaluator is the Dafny-compiled code; the Z3 encoding is tested against it.

**Corrections are checked against past cases, and conflicts go to a person.**
In the TM spike, fixes came out too narrow. The cause was the regression gate: it treated every past decision as correct, and some were mislabeled, so Claude added exceptions to protect wrong answers. Now, when a change flips a past case, the reviewer sees the case and answers "who was right?" A past decision found wrong is recorded as a probable team error, not protected.

## Product and packaging (2026-10-26)

**The mod is the product; a hosted page replays recorded runs.**
Resolve ships as a Claude Code mod (a pane beside the chat), installed from this repo. Reviewers need a one-click link, and a mod cannot be one, so a thin web page imports the same core logic and replays recorded runs, labeled as recorded. A 60 to 90 second screen recording of the mod goes at the top of the README. The mod is named `resolve` because `claude-*` names are reserved.

**One pane, three tabs: Spec, Process, Improve.**
Spec turns SOP sentences into plain-language rules and shows Z3 findings as an example case plus a question for the expert. Process is where Claude writes and runs the `kyb-review` skill. Improve runs the checker over case files and shows the pass rate by round.

**Version 2 of the pane: one ranked queue.**
Version 1 was hard to read; it was not clear what mattered most. Version 2 has one queue of items that need review, ranked by how many past cases would flip with the answer. Each option shows its consequence, answers can be sent in a batch, and a change is approved by seeing which cases flip, not by reading rules. The interface contract is in [INTERFACE.md](INTERFACE.md).

**Buttons fill the prompt box; they do not send.**
A person presses a button, the pane writes the answer to `.resolve/answers.jsonl` and drafts a message to Claude. The person sends it.

**Claude edits the review skill, never the spec or the checker.**
The improve loop may change how the agent works. It may not change what counts as correct.

**Policy owners own the translation, through cases.**
Compliance staff review the SOP-to-logic translation by answering questions about example cases, not by reading notation. Later: each approved answer becomes a drafted SOP amendment, the SOP and the spec share one version number, and an SOP edit re-opens only the questions it touches.

## Build (2026-10-26 and 27)

Agreed with Alex in the review doc "Resolve logic: review before build" (https://claude.ai/artifact/8rNGc4Xc9CR3QExGvSQMCJ). The comment threads there hold the full discussion.

### Case file (what the agent hands Resolve)
- Raw facts plus a proposed outcome. The agent never asserts "ownership complete" or "outcome follows"; Resolve computes those.
- Screening and ID checks are per person, so "every identified individual" is checkable.
- Every fact carries a source and an exact quote (or, for vendor JSON, a field name). Resolve's code checks the quote is in the cited page. Copying it is the job of whoever reads the document.
- Add the customer's certified owner list (31 CFR 1010.230 appendix A) and the ID record fields the rule requires: document type, number, place of issue, issue and expiry dates, discrepancy resolution.
- Customer documents are trusted unless they contradict each other (1010.230(b)(2)). Resolve flags contradictions.

### SOP
- Presented as based on FinCEN's CDD rule, 31 CFR 1010.230 (text in `sop/sources/`). None of the gaps against the rule is critical; the excluded-parent and exclusions-list gaps are fixed.
- Four deliberate problems, one per finding kind: see `sop/PLANTED.md`.
- A potential sanctions match is a lookup, not a judgment: the screening file carries its disposition (cleared or open, by whom, why), mocked as the output of an upstream process. Why: adjudicating hits is its own SOP, a nested process we don't build.
- Web evidence needs provenance (SOP 4.4): name plus one identifier; one strong source (court, regulator, established outlet) or two independent weaker ones; every search recorded.

### Judgment calls
- Each judgment (control person, industry class, material adverse media, PEP relative) carries typed reasons, and rules check the reasons against the SOP. Example: a control person's title must be one of the roles in 1010.230(d)(2).
- No confidence cutoff for sending calls to a person. Why: Jev's probability is opaque, model confidence is often poorly calibrated, and a score isn't auditable. Confidence is internal only (routing to a bigger model); measure its calibration on the synthetic cases.

### Cases
- 60 synthetic cases are the measurement set. Their web search runs over a made-up news corpus with realistic traps.
- A real slice of 5 to 10 UK companies (Companies House, OpenSanctions, live web search, through Alex's Chrome). Alex labels them. Not in headline numbers. Git-ignored under `cases/live/`.
- Everything measured, nothing staged: only the documents are synthetic; cases are frozen before the first run; results are reported whatever they show. If an agent gets a case right, that's fine.

### Metric and bar
- Story: speed and cost. A faster model with Resolve, or the same agent relying on Resolve's checks, reaching the same outcomes for less.
- Firm: no rise in dangerous approvals (approved when the answer was escalate, decline or request documents); false alarms on at most 10% of cases.
- Headline line, not a gate: half the cost or time of the strong agent alone. Plot cost against correct outcomes for every setup.
- Each setup runs 3 times; on 60 cases a 1 or 2 case gap is noise.
- Runs: a model ladder (Haiku, Sonnet, Opus, each alone and with Resolve), then the improve loop cutting cost while Resolve holds results fixed.
