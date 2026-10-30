# Resolve

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/resolve-hero-dark.png">
  <img alt="A page of a Know Your Business procedure with sections 5.2 and 5.3 highlighted. Resolve's note says 5.3 never applies because 5.2 escalates every money services business first. The policy owner is asked whether a business with a verified licence should still be escalated, and the chosen answer moves Cedar Ridge Payments from escalate to approve." src="docs/images/resolve-hero-light.png">
</picture>

Resolve checks an agent's case file against a written SOP. The demo is Know Your Business (KYB): the checks a bank runs to confirm who owns and controls a company before opening its account. The agent gathers the facts. Resolve checks that the right evidence was collected (for example, that ownership shares add up to 100%), and that the outcome follows from the facts and the rules. It takes the evidence itself as given: finding and reading it is a separate system, mocked here with example documents. An unknown fact is never treated as a "no".

## The system map

The [Resolve system map](https://claude.ai/artifact/SXCiqpvm3pWRhS9YjQkNGL) shows each part of Resolve, whether it is built, in review, planned or mocked, where its code lives and the decisions behind it, with a timeline of how it took shape PR by PR. Its source is `docs/architecture/index.html`.

To view it:
- Open the link in a browser signed in to claude.ai. The page is private until the maintainer shares it, so ask for access if it doesn't open.
- Or open `docs/architecture/index.html` from a checkout in any browser. GitHub shows the file as source code, not as a page.
- Use a wide window; on a phone the diagram scrolls sideways. Click a box for what it does and where it lives. The step buttons above the diagram show the system as it was after each step, with what that step added or changed outlined in yellow. A link ending in `#step-3` opens that step.

## Layout

Resolve is a general core plus one pack per domain. The core knows nothing about KYB: a spec names its own outcomes and their order, its facts, the lists of items a case has (KYB: people; expenses: lines), and the facts the pack computes. A pack turns its raw case into that shape and adds any checks of its own.

- `core/spec.ts`: the rule format. Rules are data: a condition on named facts and the outcome it leads to. "some person where ..." is written `{ "some": "people", "where": ... }`.
- `core/dafny/evaluate.dfy`: the evaluator, which applies a spec to one case (every fact is one of its values or unknown; an unknown is never read as a no), written in Dafny with proofs that it never approves on an unknown and that filling in an unknown never undoes an answer. It is compiled to `evaluate.cjs`, which is committed, so running Resolve needs no Dafny. `core/evaluate.ts` turns a spec and a case into Dafny values and the answer back.
- `core/z3.ts`, `core/sop-checks.ts`: Z3 reads the same spec and checks the SOP itself: rules that can never apply, rules that treat an unknown fact differently from the unknowns rule, facts that never change an outcome, and what changes between two spec versions. `core/show-z3.ts` prints each rule's Z3 formula next to its SOP sentence.
- `core/pane.ts`, `core/rule-formulas.ts`: write the spec, Z3's findings and each rule's formula in the shape the Resolve pane reads. `packs/kyb/pane.ts` adds the case files: each one's outcome under the rules, what's missing, and what the example evidence checks found; `pnpm resolve` runs it all.
- `core/spec-edit.ts`, `core/impact.ts`, `core/answers.ts`, `core/next-spec.ts`: the owner's answers become the next spec version. Claude writes, for each option of a finding, the spec edit it means (`drafting/write-options.ts`); Resolve works out before the owner answers what each option would change (Z3's kinds of case that decide differently, with a short example each, and the past cases that flip); the sent answers are then applied as they are, into an unapproved version that records each ruling. `pnpm next-spec` runs it for KYB.
- `core/evidence.ts`: the checks on an agent's evidence that hold in any domain: every fact has a source, every quote is really in the cited page, a cited vendor field reads as the value, and the outcome follows from the facts.
- `drafting/`: Claude drafts a spec from an SOP, outside the core, the way evidence comes from a separate system. Claude is given the facts the pack supplies (`packs/<domain>/vocabulary.md`) and drafts every decision with `prompts/sop-to-spec.md`. The draft only proposes. `draft-spec.ts` checks it against the SOP (each rule quotes whole SOP sentences, every section is accounted for), runs Z3's checks on it and compares it with the approved spec, case by case, with up to two items in each list. `propose-spec.ts` saves each call whole in `runs/spec/`, and `replay.ts` checks a saved run again without calling Claude.
- `packs/kyb/`: KYB beneficial ownership. `ownership.ts` works out who owns what across chains of companies with exact fractions; `facts.ts` turns a case file into the spec's facts (each person's share, the unaccounted share, the registry filing's age, the control person); who must be identified and when ownership is complete are rules in the spec. `case-file.ts` adds KYB's own checks on a case file (everyone the SOP needs is identified and screened, the control-person and adverse-media calls meet the SOP's bar, every search is recorded); hand-made case files for the examples are in `fixtures/case-files/`. `grounding.ts` reads the example documents (vendor fields, shares and dates against their quotes); it stands in for the separate evidence system.
- `packs/expenses/`: employee expense claims, a second small SOP that shows the core works outside KYB: the same evaluator, Z3 checks and evidence checks. Its receipts in `claims/` and claim files in `fixtures/` are mocks of the evidence system too.
- `sop/`: the SOPs. `kyb_sop.md` is the KYB beneficial-ownership SOP used for the demo (a fictional sponsor bank; section 3 follows 31 CFR 1010.230). `expenses_sop.md` is the expense-claims SOP.
- `spec/`: each SOP as written in the rule format (`kyb-v1.json`, `expenses-v1.json`). Each rule keeps a stable ID, its SOP section and the sentence it came from.
- `docs/architecture/index.html`: the system map (see above).
- `docs/brand/`: the design system (colours, fonts, wordmark, favicon) and the rules for using it.
- `mod/resolve/`: the Resolve pane, a Claude Code mod. `.claude-plugin/marketplace.json` makes this repo its marketplace: `/plugin install resolve --marketplace jinalex/resolve-process-factory`.
- `docs/INTERFACE.md`: the files the logic writes into `.resolve/` and the Resolve pane reads.
- `docs/DECISIONS.md`: what we decided and why. `docs/PRINCIPLES.md`: the rules those decisions follow. `docs/NOT-BUILT.md`: alternatives we tried or considered and set aside. `docs/WHAT-IS-VERIFIED.md`: what each check covers and what it doesn't.
- `cases/examples/`: six KYB example cases with their documents and raw facts. These, and the hand-made case files, stand in for the evidence system, which is separate from Resolve and mocked here (see "The evidence boundary" in `docs/DECISIONS.md`).
- `experiments/formal-compare/`: the same SOP written in Z3, Dafny and Lean, with raw outputs. This is the evidence for choosing Z3 for each SOP and Dafny once for the engine.

## Agentic review vs Resolve

How cases are processed today without Resolve: an agent reads the SOP and decides each case itself. That is **agentic review**, and `bench/` compares it with Resolve. Both arms are the same case runner agent (`runner/`), with the same tools, model and mocked evidence (`packs/kyb/evidence-mock.ts`); the only difference is where the decision is made. With Resolve, the approved rules decide from what the agent gathered and name the facts still missing, and the agent goes back for them.

- `bench/cases.ts`: 60 synthetic KYB cases from a seeded generator, weighted toward the edges the SOP changes and planted problems touch.
- `bench/changes.ts`: three SOP changes, each written once as SOP words (what agentic review reads) and once as spec (what Resolve reads).
- `bench/run.ts`: runs agentic review on every case, three times under the SOP as written and once under each changed SOP, plus both arms end to end; every run is recorded under `bench/runs/`.
- `bench/compare.ts`: the tables in `bench/results/`: agreement with the approved spec, the same case getting different outcomes, whether reasons cite the deciding section, which past cases each change flips and how long finding out takes, and time and cost per case.

The answer key is the approved spec, so "agrees" means agrees with the policy owner's reading. See "Agentic review as the baseline" in `docs/DECISIONS.md`.

## Planned

1. Spec checker: compile the SOP to rules, run Z3 checks (gaps, conflicts, dead rules, unknown handling), version diffs, and a backtest on past cases.
2. A world of about 60 KYB cases with planted omissions.
3. Case runner: an agent that builds the case file (in review: `runner/`, see above).
4. Verifier: evidence obligations, ownership completeness, and whether the outcome follows.
5. Improve loop: Claude edits the review skill, never the spec or the checker.
6. Dafny proofs of the engine. Done for the evaluator: it never approves on an unknown, and filling in an unknown never undoes an answer. Still planned: the ownership check is sound for any number of owners and any depth, and one outcome regardless of rule order.

## Running it

Node 22.23.4 or later (the 21 October 2026 security release) runs the TypeScript directly.

```
pnpm install
pnpm test                             # both packs: outcomes, Z3's checks, Z3 agreeing with the evaluator, the case file checks
pnpm examples                         # prints each KYB example's outcome and why
pnpm check-cases                      # Resolve's checks on the six KYB example case files
pnpm resolve                          # the same checks, written into .resolve/ for the Resolve pane (docs/INTERFACE.md)
pnpm check-sop                        # Z3's findings on the KYB SOP (add --json for the pane's format)
pnpm show-z3                          # each rule's Z3 formula next to its SOP sentence (add --raw for Z3's own numbers)
pnpm check-sop spec/expenses-v1.json  # the same checks on the expenses SOP
pnpm propose-spec                     # Claude drafts the KYB spec from the SOP, and every check runs on it (needs RESOLVE_ANTHROPIC_API_KEY)
pnpm propose-spec spec/expenses-v1.json
pnpm replay <run id>                  # checks a saved draft again, offline (add --live to ask Claude again with the same prompt)
pnpm write-options                    # Claude writes each open finding's question, options and the spec edit each option means (needs RESOLVE_ANTHROPIC_API_KEY); pnpm resolve then works out what each option would change
pnpm next-spec                        # the owner's sent answers in .resolve/answers.jsonl become the next spec version, unapproved, with what it changes
pnpm run-case --arm agentic --level e2e --case EX-1   # the case runner on an example (needs RESOLVE_ANTHROPIC_API_KEY)
pnpm bench                            # agentic review vs Resolve on 60 synthetic cases (about 400 model runs)
pnpm compare                          # the comparison tables from the recorded runs; no model calls
pnpm build-dafny                      # verifies the Dafny proofs and recompiles the evaluator (needs Dafny 4.11; add --check to compare with the committed file)
```
