# Decisions

What we decided, why, and what we gave up. Newest decisions are added at the end of each section. Alternatives we looked at and dropped are in [NOT-BUILT.md](NOT-BUILT.md); the rules these decisions follow are in [PRINCIPLES.md](PRINCIPLES.md).

## Direction (2026-10-26)

**Demo domain: KYB beneficial-ownership review, not transaction monitoring.**
The first spike reviewed transaction-monitoring alerts. Each alert was about 18 precomputed fields, so the hard part of real alert review, gathering the information, was skipped. With clean fields, Opus prompted with the reviewer's notes reached 99.3% on held-out alerts, against 96.3% for the corrected rule set. Rules did not win on accuracy, and a demo built on that would not hold up. KYB review is mostly evidence gathering, and the evidence has checkable obligations: shares should add to 100%, and no unidentified person may still be able to own 25% or more. The TM spike is dropped entirely, not kept as a backup number.

**What Resolve checks: the agent's case file.**
The case file has three layers. Facts are gathered by the agent and cannot be proven, only sourced and backtested. Evidence obligations are formal (for example, ownership completeness). Decision logic is formal. A fact that is unknown is never treated as "no". Short version: a lint for whether the right evidence was collected, and for checking that evidence against the rules.

**Z3 for each SOP, Dafny once for the engine.**
We wrote one KYB SOP in Z3, Dafny, Lean and Bend (`experiments/formal-compare/`). Z3 finds counterexamples and version diffs in seconds, which is what a reviewer needs for each SOP and each change, but it cannot prove a claim for any number of owners. Dafny proved the unbounded ownership facts with one or two hint lines. Lean worked but took the most effort and gives no counterexamples by default. So: Z3 runs on every SOP and every change; Dafny will prove a few facts about Resolve's own engine once. The trial proved facts about one hard-coded SOP with flat ownership only; the engine proofs below are planned, not done. AWS Cedar is built the same way (a proof of the compiler done once, a solver run per policy).

Engine facts to prove once in Dafny (planned):
1. The ownership completeness check is sound for any number of owners and any chain depth.
2. For any SOP, Resolve never approves on an unknown, and an answer given with unknowns does not change once they are filled in (unless it was "incomplete").
3. A case missing a fact its outcome depends on is never approved (added 2026-10-27).
4. There is one outcome regardless of rule order.
5. The runtime evaluator starts as hand-written TypeScript and is replaced by the Dafny-compiled code once the proofs exist; the Z3 encoding is tested against it.

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

Agreed by the maintainer in the review doc "Resolve logic: review before build" (https://claude.ai/artifact/8rNGc4Xc9CR3QExGvSQMCJ). The comment threads there hold the full discussion.

### Language and stack (2026-10-27)
- Resolve is built in TypeScript. One language covers the core, the mod pane, the hosted page and a Cloudflare Worker.
- Measured first: the same SOP checks in Z3 5.3.2 from Python and from TypeScript (WebAssembly) gave the same answer every time. TypeScript was 3 to 6 times slower but still fast (unknowns check 65 ms vs 11 ms; a 64-owner stress test 7 s vs 2 s). The checks run once per SOP version, so the gap doesn't matter.
- A plain library tested with Vitest, Anthropic's SDK for model calls, and the Claude Agent SDK for the headless agent runs.

### Case file (what the agent hands Resolve)
- Raw facts plus a proposed outcome. The agent never asserts "ownership complete" or "outcome follows"; Resolve computes those.
- Screening and ID checks are per person, so "every identified individual" is checkable.
- Every fact carries a source and an exact quote (or, for vendor JSON, a field name). Resolve's code checks the quote is in the cited page. Copying it is the job of whoever reads the document.
- Add the customer's certified owner list (31 CFR 1010.230 appendix A) and the ID record fields the rule requires: document type, number, place of issue, issue and expiry dates, discrepancy resolution.
- Customer documents are relied on only if nothing known contradicts them: not other documents, and not screening or web results (1010.230(b)(2)). Resolve flags contradictions. Catching forged documents is out of scope for the product; the rule does not excuse it.

### SOP
- Presented as based on FinCEN's CDD rule, 31 CFR 1010.230 (text in `sop/sources/`). None of the gaps against the rule is critical; the excluded-parent and exclusions-list gaps are fixed.
- Deliberate problems, one per finding kind: see `sop/PLANTED.md`.
- Escalating while a check is still pending is fine (policy owner, 2026-10-27). The planted "unknown hidden behind an escalation" is retired; Resolve adds a note to such a case instead. Its replacement (policy owner, 2026-10-27) is a pending ID check: SOP 3.4 calls the person "unverified" and says request documents, which 2.1 ranks above incomplete, while 2.2 says the fact is unknown. So a slow ID vendor gets the customer asked for documents.
- A potential sanctions match is a lookup, not a judgment: the screening file carries its disposition (cleared or open, by whom, why), mocked as the output of an upstream process. Why: adjudicating hits is its own SOP, a nested process we don't build.
- Web evidence needs provenance (SOP 4.4): name plus one identifier; one strong source (court, regulator, established outlet) or two independent weaker ones; every search recorded.

### Judgment calls
- Each judgment (control person, industry class, material adverse media, PEP relative) carries typed reasons, and rules check the reasons against the SOP. Example: a control person's title must be one of the roles in 1010.230(d)(2).
- No confidence cutoff for sending calls to a person. Why: Jev's probability is opaque, model confidence is often poorly calibrated, and a score isn't auditable. Confidence is internal only (routing to a bigger model); measure its calibration on the synthetic cases.

### Cases
- 60 synthetic cases are the measurement set. Their web search runs over a made-up news corpus with realistic traps.
- A real slice of 5 to 10 UK companies (Companies House, OpenSanctions, live web search, through the maintainer's browser). The maintainer labels them. Not in headline numbers. Git-ignored under `cases/live/`.
- Everything measured, nothing staged: only the documents are synthetic; cases are frozen before the first run; results are reported whatever they show. If an agent gets a case right, that's fine.

### Improve loop
- Claude edits only the review skill. A person approves every spec change.
- Each round reports what got worse, not just what got better.
- The 60 synthetic cases split 40 to learn from and 20 to score on.
- Past decisions that disagree with a change become questions for a person, not vetoes.
- A rule change is signed off by the BSA officer or the policy lead. The policy owner owns this question.
- Still proposed, not decided: a score set stratified by case type, 3 rotated splits, and results reported as counts.

### Metric and bar
- Story: speed and cost. A faster model with Resolve, or the same agent relying on Resolve's checks, reaching the same outcomes for less.
- Firm: no rise in dangerous approvals (approved when the answer was escalate, decline or request documents); false alarms on at most 10% of cases.
- Headline line, not a gate: half the cost or time of the strong agent alone. Plot cost against correct outcomes for every setup.
- Each setup runs 3 times; on 60 cases a 1 or 2 case gap is noise.
- Runs: a model ladder (Haiku, Sonnet, Opus, each alone and with Resolve), then the improve loop cutting cost while Resolve holds results fixed.

## Verification (2026-10-27)

Agreed in section 6 of the same review doc. Details, including a table of each kind of breakage and what catches it, are in [WHAT-IS-VERIFIED.md](WHAT-IS-VERIFIED.md).

- **Z3 checks the SOP; Dafny checks Resolve's own core.** Z3 runs on every SOP and every new version; a Z3 finding means the SOP needs fixing. The Dafny proofs are planned, written once and re-run whenever the core changes; a failed proof points at Resolve's code (or a missing proof hint), never the SOP. Checking a single case file needs neither: it is plain code, hand-written TypeScript at first and the Dafny-compiled evaluator once the proofs exist.
- **Solver vs tests.** Plain code decides each case, Z3 runs the SOP checks, and a brute-force test checks that the two agree on every combination of facts small enough to enumerate.
- **Model outputs only propose.** Models turn the SOP into rules, gather facts and make judgment calls; none of that can be proven. Each output passes through the checked core (rule evaluator, ownership completeness, quote check, provenance and reason rules) or through a person. The pitch claim is "every model output passes through a verified check or a person", not "Resolve is verified".
- **Evals and Resolve do different jobs.** An eval gives a rate on cases with known answers but can't say which live case is in the wrong share. Resolve checks each live case as it runs. The 60 synthetic cases are the eval of Resolve itself.
- **Full scope, built in layers.** The maintainer challenged the scope as devil's advocate, then kept all of it. Layer 1: per-case checker, Z3 SOP checks with the brute-force agreement test, eval harness and model ladder. Layer 2: Dafny proofs of the core, a second independent reader for evidence, and the real UK company slice. Something works at the end of each layer.

## After the Codex review (2026-10-27)

OpenAI Codex reviewed "Resolve logic: review before build" and raised 26 findings. These were applied to the review doc:

- **Rules follow the SOP as written.** Rule order follows the SOP text and is pinned to an SOP revision. Rules get stable IDs, and answers are tied to a spec revision. (The pane still shows plain sentences, not IDs.)
- **Unknowns are three-valued.** A missing value, or an empty list of people, counts as unknown, never as "none".
- **Ownership is exact.** Shares are summed across every path in basis points, with no rounding.
- **Outcomes are computed, not given.** The example truth files hold raw facts only; `evaluate.ts` computes ownership completeness and the outcome. Before this, the reference evaluator read ready-made conclusions, so it could not catch wrong ownership arithmetic.
- **The control person can be named by role or by what they do** (1010.230(d)(2)(ii), "regularly performs similar functions").
- **Recorded runs store full payloads.** Replacing a recorded step with a live call forks a new run from that point, since later steps may no longer hold.
- **Held-out cases stay held out.** The 20 score cases never choose between edits, and a fresh final batch that the loop never touches gives the reported result.
- **Dafny proofs are described as planned, not done.** See above.

## After the PR #3 reviews (2026-10-28)

Codex and Grok reviewed the rule format, the evaluator and the KYB pack (PR #3). Each reproduced cases that were approved but should not have been, while all 29 tests passed. The rules in the spec matched their SOP sentences. The faults were elsewhere:

- **SOP logic in pack code had no independent check.** Who must be identified under 3.3, when the excluded-entity exemption applies, and what an over-100% cap table means were worked out in `packs/kyb`, which Z3 takes on trust and the side-by-side SOP view doesn't show. Half of 3.3 was missing there: a 40% owner left off the list of identified individuals was never screened. This is now principle 15 (strict, policy owner, 2026-10-28): rules decide, including who counts; code only computes, and each computed fact has a reference test that doesn't share its code. The KYB pack is brought in line in the PR after the stack.
- **The edge read bad input as "no".** A value outside a fact's declared values (`"pending"`), an unreadable date and raw industry wording slipped past the rules. Each now counts as unknown, or is mapped onto the spec's values.
- **Outside lists need a date and a source.** The FATF list had 7 of its 25 jurisdictions. The spec now records where each outside list comes from and when.
- **A cap table over 100% asks for documents** (policy owner, 2026-10-28). The SOP doesn't say; listed shares that can't all be right mean ownership isn't established.
- **Tests must be able to fail.** Each rule is now checked against an outcome written by hand from the SOP, so a rule that says the wrong thing fails even when the evaluator agrees with itself.

## After the PR #4 reviews (2026-10-28)

Codex and Grok reviewed the Z3 checks on the SOP (PR #4). All 48 tests passed, and Z3 found the three planted problems, but:

- **An example must be a case the finding is about.** The 3.4 example Z3 picked escalated, with the facts that escalated it left out. Each check now asks for a case its rule decides, and every example is run through the evaluator before it is shown.
- **"Never" means "never with up to two people", and says so.** Z3 looks at two people per list, so a rule needing three different people is reported dead. A bound worked out from the spec covers every case but grew too slow as the SOP grows (3.5 minutes at four times KYB's rules). Faster checks that cover every case are a follow-up; until then each proof states its bound.
- **The two copies of the rules must read every input alike.** A list value the fact can't take, a declared "unknown", a literal "other", and a negative or missing registry age each led Z3 and the evaluator to different outcomes. The agreement test compared outcomes only and missed them. It now compares each rule, with direct cases for each input.
- **An undeclared computed value is unknown** (maintainer, 2026-10-28), as an undeclared fact value already was. Before, the evaluator read "maybe" as a known "no" and could approve.

## The evidence boundary (2026-10-28)

The reviews of the case file checks (#8) found that a file with forged or misread evidence could pass: a value its quote doesn't support, another person's screening result, a source's quality stated by the agent itself. Fixing each one inside Resolve pulled KYB's vendor fields and document formats into the core. The maintainer drew the line instead:

- **Resolve takes facts as given.** It checks that the SOP is sound, that the right evidence was asked for and collected, that each fact has a source a person can open, and that the outcome follows from the facts and the rules.
- **Evidence grounding is a separate system** behind a small contract: each fact is a value or "unknown", plus a source pointer (document and quote, field, or search record). Whether the value follows from its source is that system's job, with its own evals and a second reader. The prototype mocks it with the example documents and hand-made case files. The parked findings, each with a counterexample, are in issue #11.
- **The generic provenance checks stay** (the quote is really in the cited document, a cited field exists, a pending check blocks the decision), because they are cheap and hold in any domain. KYB's stricter checks (shares and names against their quotes, vendor results about the right person, the 4.4 source bar) live in the KYB pack as an example adapter for that boundary, not as part of the core.
- **The claim follows.** Resolve catches missing evidence, missed people and outcomes that don't follow, assuming the evidence it is given is sound. It does not claim to catch fabricated evidence.
