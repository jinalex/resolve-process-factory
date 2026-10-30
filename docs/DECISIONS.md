# Decisions

What we decided, why, and what we gave up. Newest decisions are added at the end of each section. Alternatives we looked at and dropped are in [NOT-BUILT.md](NOT-BUILT.md); the rules these decisions follow are in [PRINCIPLES.md](PRINCIPLES.md).

## Direction (2026-10-26)

**Demo domain: KYB beneficial-ownership review, not transaction monitoring.**
The first spike reviewed transaction-monitoring alerts. Each alert was about 18 precomputed fields, so the hard part of real alert review, gathering the information, was skipped. With clean fields, Opus prompted with the reviewer's notes reached 99.3% on held-out alerts, against 96.3% for the corrected rule set. Rules did not win on accuracy, and a demo built on that would not hold up. KYB review is mostly evidence gathering, and the evidence has checkable obligations: shares should add to 100%, and no unidentified person may still be able to own 25% or more. The TM spike is dropped entirely, not kept as a backup number.

**What Resolve checks: the agent's case file.**
The case file has three layers. Facts are gathered by the agent and cannot be proven, only sourced and backtested. Evidence obligations are formal (for example, ownership completeness). Decision logic is formal. A fact that is unknown is never treated as "no". Short version: a lint for whether the right evidence was collected, and for checking that evidence against the rules.

**Z3 for each SOP, Dafny once for the engine.**
We wrote one KYB SOP in Z3, Dafny, Lean and Bend (`experiments/formal-compare/`). Z3 finds counterexamples and version diffs in seconds, which is what a reviewer needs for each SOP and each change, but it cannot prove a claim for any number of owners. Dafny proved the unbounded ownership facts with one or two hint lines. Lean worked but took the most effort and gives no counterexamples by default. So: Z3 runs on every SOP and every change; Dafny will prove a few facts about Resolve's own engine once. The trial proved facts about one hard-coded SOP with flat ownership only; the engine proofs below are planned, not done. AWS Cedar is built the same way (a proof of the compiler done once, a solver run per policy).

Engine facts to prove once in Dafny (2 and 3 proved, and 5 done, on 2026-10-29: see "The evaluator in Dafny" below; 1 and 4 still planned, and checked as property tests on random specs in `core/evaluate.test.ts`, see "The evaluator's properties" below):
1. The ownership completeness check is sound for any number of owners and any chain depth.
2. For any SOP, Resolve never approves on an unknown, and filling in unknowns never takes an answer back: a rule's yes or no stays put, so an outcome can only get more severe, except the unknowns outcome itself ("incomplete"), which can move either way, and an outcome decided by a rule that asks whether a fact is unknown (corrected 2026-10-29, after the PR #16 review).
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

- **SOP logic in pack code had no independent check.** Who must be identified under 3.3, when the excluded-entity exemption applies, and what an over-100% cap table means were worked out in `packs/kyb`, which Z3 takes on trust and the side-by-side SOP view doesn't show. Half of 3.3 was missing there: a 40% owner left off the list of identified individuals was never screened. This is now principle 15 (strict, policy owner, 2026-10-28): rules decide, including who counts; code only computes, and each computed fact has a reference test that doesn't share its code. The KYB pack was brought in line next; see below.
- **The edge read bad input as "no".** A value outside a fact's declared values (`"pending"`), an unreadable date and raw industry wording slipped past the rules. Each now counts as unknown, or is mapped onto the spec's values.
- **Outside lists need a date and a source.** The FATF list had 7 of its 25 jurisdictions. The spec now records where each outside list comes from and when.
- **A cap table over 100% asks for documents** (policy owner, 2026-10-28). The SOP doesn't say; listed shares that can't all be right mean ownership isn't established.
- **Tests must be able to fail.** Each rule is now checked against an outcome written by hand from the SOP, so a rule that says the wrong thing fails even when the evaluator agrees with itself.

## After the PR #4 reviews (2026-10-28)

Codex and Grok reviewed the Z3 checks on the SOP (PR #4). All 48 tests passed, and Z3 found the three planted problems, but:

- **An example must be a case the finding is about.** The 3.4 example Z3 picked escalated, with the facts that escalated it left out. Each check now asks for a case its rule decides, and every example is run through the evaluator before it is shown.
- **"Never" means every case.** The checks looked at two people, so a rule needing three was reported dead. The number of people Z3 looks at is now worked out from the spec, enough to cover every case.
- **The two copies of the rules must read every input alike.** A list value the fact can't take, a declared "unknown", a literal "other", and a negative or missing registry age each led Z3 and the evaluator to different outcomes. The agreement test compared outcomes only and missed them. It now compares each rule, with direct cases for each input.
- **An undeclared computed value is unknown** (maintainer, 2026-10-28), as an undeclared fact value already was. Before, the evaluator read "maybe" as a known "no" and could approve.

## The evidence boundary (2026-10-28)

The reviews of the case file checks (#8) found that a file with forged or misread evidence could pass: a value its quote doesn't support, another person's screening result, a source's quality stated by the agent itself. Fixing each one inside Resolve pulled KYB's vendor fields and document formats into the core. The maintainer drew the line instead:

- **Resolve takes facts as given.** It checks that the SOP is sound, that the right evidence was asked for and collected, that each fact has a source a person can open, and that the outcome follows from the facts and the rules.
- **Evidence grounding is a separate system** behind a small contract: each fact is a value or "unknown", plus a source pointer (document and quote, field, or search record). Whether the value follows from its source is that system's job, with its own evals and a second reader. The prototype mocks it with the example documents and hand-made case files. The parked findings, each with a counterexample, are in issue #11.
- **The generic provenance checks stay** (the quote is really in the cited document, a cited field exists, a pending check blocks the decision), because they are cheap and hold in any domain. KYB's stricter checks (shares and names against their quotes, vendor results about the right person, the 4.4 source bar) live in the KYB pack as an example adapter for that boundary, not as part of the core.
- **The claim follows.** Resolve catches missing evidence, missed people and outcomes that don't follow, assuming the evidence it is given is sound. It does not claim to catch fabricated evidence.

## Moving 3.3 into the spec (2026-10-28)

Principle 15 applied to the KYB pack. `packs/kyb` now only adds up shares; the spec decides the rest, so Z3 checks it and `pnpm show-z3` prints it next to its SOP sentence.

- **Who must be identified is a rule on the people list.** The list holds everyone the case names: the agent's people, every named owner and the control person. The spec's `counts_when` says who the SOP's rules are about: anyone the agent listed, the control person (3.2), anyone the customer certifies at 25% or more, and anyone whose share plus the share nobody is identified for reaches 25% (3.3). Someone who might count is treated as counting, so an unknown never hides them.
- **Ownership completeness is a sum in the spec.** The pack gives each person's total share, each excluded entity's share and the unaccounted share. The spec adds up what nobody is identified for: the unaccounted share plus each excluded entity under 25% (3.3's exemption). At 25% or more, 3.3 asks for documents.
- **The over-100% decision is its own rule** (`ownership-over-100`, policy owner, 2026-10-28), so the SOP view shows it apart from 3.3's sentence.
- **The SOP's industry words are a table in the spec** (`maps`), read by the evaluator and Z3 alike. It holds only the words the SOP itself uses, as its glossary. Classifying a business ("CBD retailer") is the evidence layer's judgment, not a longer table: a list of synonyms in the spec would be a judgment nobody audits (maintainer, 2026-10-29).
- **Sums are exact.** Shares reach the spec as exact fractions ("100/3"), and the evaluator adds them exactly, the way Z3 does. An earlier cut to ten decimals approved an owner at exactly 25% (found in review).
- **Still open:** the computed shares have no reference test that doesn't share their code yet (the Dafny ownership model is the planned one).

## After the PR #13 reviews (2026-10-28)

Codex, Grok, Gemini (read-only) and Tenki reviewed the move of 3.3 into the spec. What came out of it:

- **"Some" says no only when someone certainly counts.** If nobody certainly counts (everyone might, or nobody does), the list could be empty, and an empty list is unknown unless the spec's empty rule holds. Otherwise filling in an unknown share could turn an approval into incomplete, which principle 1 forbids. A reviewer suggested the opposite (a list where everyone certainly fails to count is a definite no); it was kept as unknown, the same as the old empty-list rule.
- **3.3's exemption is encoded, not just quoted.** Who counts by share or certification, and the control person, are guarded by "the entity isn't excluded" and "isn't a nonprofit", so case facts are now allowed inside `counts_when`.
- **A spec can't loop through who counts.** `validateSpec` follows sums, `sum_over`, `counts_when` and empty rules, and refuses a cycle before anything is evaluated.

## Claude drafts the spec (2026-10-28)

**Claude drafts every decision in the spec from the SOP; the draft only proposes.** Claude is given the facts the pack supplies (`packs/<domain>/vocabulary.md`), the lists and the outcome names, and drafts the order, the rules, who a list's rules are about, the sums and the word maps. The draft must load, quote whole sentences of the SOP sections it cites, and account for every numbered section; then Z3's checks run on it and `diffSpecs` compares it with the approved spec over every case with up to two items in each list. Nothing replaces the approved spec without a person (principles 5 and 6). Why the facts are given rather than drafted: "rules decide, code only computes" (principle 15). A sentence that needs a fact the pack doesn't supply goes in the draft's `needs`, not into an invented fact.

**Every model call is saved whole** (`runs/spec/<id>.json`: the code version, the prompt, the hash of each input file, the request as sent and the response as received), so a draft can be checked again offline and the tests never call Claude. A later check of the same reply is added beside the first verdict, never over it.

**Word maps are compared word by word, not by Z3.** Z3 compares the rules on the spec's own values; how each spec reads a case's words is a table, so the two tables are compared directly.

**Drafting is its own layer, outside the core (2026-10-29).** Like evidence, a draft is a model's proposal checked against a source (here the SOP) before the core uses it, so `drafting/` sits beside `core/`, and `core/` holds only what applies and checks a spec. Most findings of the PR #15 review were in this layer; the core changed only so that Z3 giving up no longer counts as "no difference".

**A case's words are read whatever their case (maintainer, 2026-10-29).** A fact with declared values reads the case's word trimmed and in lower case, whether or not a word map lists it, so "Gift" is gift. A fact that takes any value, like a country code, keeps the word as written. Before, only mapped words ignored case, so adding a map entry that maps a word to itself changed outcomes (found in the PR #15 review).

## The evaluator's properties (2026-10-29)

**The evaluator's properties are tested on random specs, then proved where a day of Dafny allows (maintainer, 2026-10-29).** `core/evaluate.test.ts` checks the engine facts above on thousands of made-up specs and cases (`core/arbitrary.ts`), with numbers at and next to each threshold, and `core/z3.test.ts` checks that Z3's encoding agrees with the evaluator on random specs, not only on a pack's. Dafny is time-boxed to one day for the two safety properties (never approves on an unknown; filling in an unknown never undoes an answer); what it proves replaces the tests' word "tested" with "proved" for those two only.

**Filling in an unknown can undo an answer through a rule that asks whether a fact is unknown.** KYB 3.4 asks for documents when an ID check is unknown, and the expenses SOP returns a line whose receipt is unknown. Once the fact is known, those rules can stop applying and the case can approve. This is by design: such a rule asks for the missing fact. So the property is stated without them: a rule's yes or no stays put when unknowns are filled in, unless the rule asks whether a fact is unknown (itself, or through a sum or a list it reaches). Filling in can still make an outcome more severe, and can move the unknowns outcome either way; any other outcome gets less severe only when a rule that decided it asks whether a fact is unknown. Who counts in a list may not ask at all, since "some" under a "not" reads it the other way round (found in the PR #16 review).

**A list the case doesn't give adds up to unknown, not 0 (maintainer, 2026-10-29).** A sum over a list's items used to read a missing list as empty, so a rule such as "lines add up to 1,000 or more" didn't apply to a claim whose lines were never given, and the claim could approve: an unknown read as a no. Now a missing list (null) adds up to unknown and an empty list (given, with no items) to 0, in the evaluator and in Z3. Where the spec says an empty list is fine, a missing list adds up to 0 too, the way "some item" already reads it (found in the PR #16 review). No pack's outcome changed. A missing list can be filled in as an empty one, but adding items is new evidence, not an unknown filled in, so the properties keep each list's items fixed.

## Scaling the SOP checks (2026-10-28)

The PR #4 review measured the checks on the SOP slowing from 5 s at 13 rules to 271 s at 52 (KYB copied four times). Each check asked one question per rule, each question held the whole SOP, and the number of people Z3 looked at grew with the whole SOP too.

- **The checks ask about one group of rules at a time.** Rules that share no facts can't affect each other. The checks split the SOP into such groups, work out which outcomes each group can reach, and ask each question about one group with the rest summarised. The number of people Z3 looks at counts only the question's own group. A yes-or-no fact most rules read (KYB's "excluded") is fixed to each value in turn so it doesn't tie everything into one group. A shared fact is split on only when that shrinks the largest group or an estimate says it pays: splitting a tangled SOP multiplies the work on the same big group. On #13's KYB, copied sixteen times with a people list each (224 rules), the checks take about 5 minutes and grow in proportion to the rules.
- **How the time grows depends on the SOP.** If sections share few facts, the time grows about in proportion to the rules. If every section reads every other's facts, one group holds most of the SOP and the time grows about with its square. No exact method avoids that: the questions include satisfiability. The size of the largest group is reported as a measure of how tangled an SOP is.
- **Grouping must not change any answer.** A test runs every check on the whole SOP as one group, with automatic grouping, and with every shared fact split on, and requires the same findings. Every example is still run through the evaluator.
- **Who counts ties a list's rules together** (maintainer, 2026-10-29). Since #13 a list's `counts_when` is part of every "some" on it, so every rule about people reads the same facts and lands in one group; a list that is added up (`sum_over`) does too, since repeating an item changes a sum. The checks stay correct; making them separate again (padding with items no other group notices) is a follow-up with its own review.
- **How many people a check looks at** is worked out per check: one witness per "some" condition plus one item that counts, shared between the two copies a check compares except where a condition asks whether a fact is unknown. KYB's people group needs 10. Where that would take minutes (the unknowns check past 6), the check looks at fewer and its proof says "with up to N items" (maintainer, 2026-10-29: full where cheap, stated otherwise). A list that is added up has no such bound (six people at 5/6 reach 5): it is checked with a few items, and every check and diff of it says how many (`sopCoverage`, `diffCoverage`; found in the PR #18 review).
- **Two more facts to prove once in Dafny:** the people bound and the grouping argument.

The write-up with the measurements and the comparison with the alternatives is in the PR description.

## The evaluator in Dafny (2026-10-29)

**The evaluator is written in Dafny, and the code that runs is compiled from it (maintainer, 2026-10-29: time-boxed to a day, on the two safety properties).** `core/dafny/evaluate.dfy` is a port of the TypeScript evaluator: the same three-valued logic, the same order of rules, the same exact numbers. `pnpm build-dafny` verifies it and compiles it to `evaluate.cjs`, which is committed so nobody needs Dafny to run Resolve; CI verifies the proofs and fails if the committed file is stale. `core/evaluate.ts` is now an adapter: it reads each value as before (missing, null, blank and "unknown" in any case are unknown; the word trimmed and in lower case; the exact number), builds the Dafny values, and writes the notes. Plan: https://claude.ai/artifact/Ly6ySmj35vW3jEuqHUGBoE.

**Proved, for every spec in the rule format and every case:**
1. *Never approves on an unknown* (`NeverApprovesOnAnUnknown`). If the outcome ranks below the unknowns outcome (approve below incomplete), no rule might apply. No well-formedness is assumed.
2. *Filling in an unknown never undoes an answer* (`FillingInNeverUndoesAnAnswer`). Let a second case fill in some of the first's unknown values and change nothing else the rules read. Then an outcome below the unknowns outcome stays exactly as it was, and one above it stays or gets more severe, decided by a rule the first result listed as might apply. Whatever the outcome, every rule that decides it applied or might have applied before. The unknowns outcome itself can move either way. Outcomes rank by their place in the spec's order, and `validateSpec` makes every rule's outcome one of them.

**Where property 2 stops, on purpose.**
- *`is_unknown`.* A rule that applies because a fact is unknown stops applying once the fact is filled in, so property 2 assumes no condition in the spec uses `is_unknown`. KYB's ID rule and the expenses receipt rule both do: a pending ID check asks for documents, and filling it in can then approve, as SOP 3.4 says. The property tests check the cut the same way.
- *Lists keep their items.* "Some item" reads a missing list as an empty one, which can be a decided "no" (an excluded entity needs no individuals), so adding items is new evidence, not an unknown filled in. A list the first case gives stays given; one it leaves out may be given empty, since its sum was unknown.
- *Unknown means as the evaluator reads it:* a missing value, blank or "unknown", a word outside the fact's values, a numeric fact that isn't a number. A computed fact is read as its declared type says, by the rules and by the proof alike: a numeric one by its number, any other by its word.

**How we know the port is faithful.** Before the swap, the two evaluators were compared on 12,000 random specs and cases and mutated KYB and expenses cases (odd case, undeclared words, numbers at the thresholds, a list left out): no difference, to the note and the sum. 400 of them are saved in `core/dafny/agreement.json` and checked by a test; a planted off-by-one at a threshold fails it. All existing tests pass unchanged.

**What changed in behaviour, only for specs `validateSpec` already refuses.** A spec that declares a fact, list or computed fact twice is refused by the adapter instead of read with whichever declaration a lookup found first. A spec that loops through who counts or a sum gets unknown where the TypeScript recursed forever: the Dafny evaluator steps into another part of the spec at most once per list and computed fact, which is always enough for a spec without cycles. A rule that reads a numeric computed fact as a word, or the other way round, gets unknown.

**Costs.** The compiled code is about four times slower than the TypeScript (about 0.8 ms a KYB case against 0.2 ms), mostly the big-number arithmetic Dafny's JavaScript uses; who counts in each list is worked out once per case to keep it there. The list helpers loop by index, so a list of 100,000 items takes about two seconds and doesn't overflow the stack. The spec is converted on every call, not cached, so a spec edited in place runs as it now reads. The Z3 encoding still reads words with the adapter's `readFact`, so the Z3 agreement test still shares that code; giving Z3 its own reading is the next step in the plan.

## Agentic review as the baseline (2026-10-29)

To show what Resolve adds, it is compared with the way a team would process cases today without it: an agent given the SOP that decides each case itself. The maintainer named it **agentic review**.

- **Both arms are the same agent.** One case runner, the same tools, the same mocked evidence and the same model (the strongest available, so a Resolve win can't be put down to a weak rival). In agentic review the agent decides; with Resolve, the approved rules decide from what the agent gathered and name the facts still missing. Only the decision layer differs.
- **The evidence is mocked for both.** A mock answers one request at a time from each case's raw facts and logs what was asked; Resolve's case file is exactly those answers. Misread or forged evidence would hit both arms alike and is out of scope, as in "The evidence boundary".
- **Two levels.** Decision only: both get every fact, so only the decision step differs. End to end: both start from nothing and must ask, which also shows which arm catches missing evidence.
- **The answer key is the approved spec,** so agreement means agreement with the policy owner's reading, not ground truth. Where agentic review differs on a planted problem, that is reported as a reading the SOP left open, not as the model being wrong.
- **The pitch is change, consistency and audit, not accuracy.** The transaction-monitoring spike (2026-10-26) had prompting ahead of corrected rules on accuracy. What the comparison measures is which past cases a SOP change flips, how long finding out takes, whether a case gets the same outcome twice, and whether the reasons cite the section that decides it.
- **The SDK.** The runner calls the Anthropic API directly with its own tool loop rather than through the Claude Agent SDK: it needs only its own three tools, and a plain loop records every message, plus a hash of the system prompt (with the SOP) and tools each run used.

## Answers become the next spec (2026-10-29)

**Claude writes each option's spec edit when it writes the question, and Resolve checks every option before the owner answers (maintainer, 2026-10-29).** An answer like "Yes, incomplete first" is a sentence; the rule change it means has to be written by someone, and code guessing it would be code deciding (principle 15). The alternative was for Claude to write the edit after the answer. That is simpler, but the owner would see what a choice flips only after making it. With the edit written up front, each option is checked like any model output (principle 5): it must load, quote the SOP, and Z3 checks the edited spec again. The owner sees under each button whether the finding goes away, any new finding it causes, every kind of case that decides differently with a short example, and the past cases that flip (principle 7). Applying the answer is then mechanical. It costs one edit per option, most of them unused, and a full Z3 re-check per option: about 18 seconds each on KYB today, so it runs when the options are written, not on each click.

**An answer doesn't rewrite the SOP's words.** A rule an edit replaces keeps its SOP sentence; the version records the owner's ruling (question, choice, edits, the version it was asked on) next to it. Writing the ruling back into the SOP is the owner's job and a later step.

**One version per batch, and clashes go back to the owner.** The answers a send names go into one version together. Two answers that change the same rule are refused, naming both questions, so the owner answers one again, rather than one quietly overriding the other. KYB's two findings about 5.3 (it never decides a case; the licence check never matters) are the case in point.

**Examples are cut to what makes them flip, and shown whole.** Z3's example for a change of outcome sets every fact. The evaluator drops lists and items and makes facts unknown while the case still flips, so of two facts that each set off a rule only one is left. What is shown is a whole case: every known fact and how many items each list has, with everything else unknown, and read back that way it is checked to flip as stated. An earlier version showed only the facts the edit reads; reviewers found examples that didn't flip as written, so a person couldn't replay them.

**The owner applies only what they were shown (adversarial review, 2026-10-29).** Each option's impact carries a fingerprint of the spec and edits it was worked out from. `pnpm next-spec` applies an answer only if the picked option's impact is current and had no problems, and an approval counts only if it names the `spec_hash` the pane showed. A send is one batch: if any line in it can't be read, nothing is written. Findings are compared by what they say, not by id. And where the search is bounded, the bound is stated: "no case with up to N items in each list changes", not "no case changes".

**An unknown can't lead to the outcome a clean case gets (adversarial review, 2026-10-29).** `validateSpec` refuses a spec whose unknowns outcome is the last in the order, since an unknown would then pass as a no (principle 1). Before, an answer could set it and Z3 would not flag it.


## A certification not on file is unknown (2026-10-29)

**No certification means nobody knows whom the customer would certify (policy owner, 2026-10-29).** The spec counts anyone the customer certifies at 25% or more, and the KYB pack read a case with no certification as certifying nobody: every certified share was 0. So a case whose only gap was the missing certification could approve, and turn into request documents once a certification named someone new (found in the code audit). Now, with no certification on file, everyone's certified share is unknown and someone the certification might name stands in, at an unknown share and apart from anyone of the same name. Unless the entity is excluded or a nonprofit, such a case is never approved, and filling in the certification never undoes a firm outcome. With a certification on file, someone it leaves out is certified at 0. A case file's certification counts as on file only with a list of owners and a document it comes from.

The adversarial review (see the PR) added two rules that follow from it. Someone who only might count keeps their screening but isn't listed as identified, so a sanctions hit on a 20% owner holds the case as pending instead of declining a case the certification would approve. And everything unknown because of the missing certification is told as that one document, never as the stand-in's sanctions or residence. The example truth files now carry the certification from their documents; no example's outcome changed.

## The replay page (2026-10-29)

**The replay page shows the files the core wrote, not a second copy of the core (proposed with the replay page).** Principle 13 has the hosted page import the same logic as the mod. The logic that matters is Z3 and the Dafny-compiled evaluator, and a page that ran them would be a second, browser-only build of Resolve to keep in step. The page instead reads the same files the pane reads (`docs/INTERFACE.md`), saved at each step of one real run in `replay/recording/`, so what it shows is exactly what Resolve and Claude wrote, and it can never disagree with the core. The cost: a reviewer can't change a fact and see the outcome move. A later page could add that by running the compiled evaluator alone, which needs no solver.

**One recording, built into one file.** `pnpm build-replay` puts the recording, `replay/style.css` and `replay/page.js` into `replay/index.html`, which is published as a Claude Artifact. A test fails when the committed page is not what the recording builds, and when a recorded answer picks an option the owner wasn't shown on that version. The look lives only in `style.css`'s tokens, so the page can be restyled without touching what it says.
