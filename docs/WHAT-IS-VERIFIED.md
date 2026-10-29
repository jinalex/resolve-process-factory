# What Resolve verifies, and what it doesn't

Agreed by the maintainer in the review doc (updated 2026-10-27 after the Codex review) "Resolve logic: review before build" (https://claude.ai/artifact/8rNGc4Xc9CR3QExGvSQMCJ, section 6 comment thread), 2026-10-27. The decisions it records are summarised in [DECISIONS.md](DECISIONS.md).

## Two checks, on two different things
- **Z3 checks the SOP.** It runs on every SOP and every new version, and finds rules that never apply, contradictions and unknowns hidden behind an escalation. If Z3 finds a problem, the SOP needs fixing.
- **Dafny checks Resolve's own code.** Proofs, re-run in CI whenever that code changes, that the evaluator has two stated properties for any spec in the rule format and any case: it never approves on an unknown, and filling in an unknown never undoes an answer (for specs where no part asks whether a fact is unknown; see "The evaluator in Dafny" in [DECISIONS.md](DECISIONS.md)). Still planned: ownership completeness sound at any depth, and one outcome whatever the rule order. If a proof fails, the first suspect is Resolve's code; it can also be a missing proof hint or a tool problem, never the SOP.
- Put simply, Dafny checks the ruler, and Z3 measures each SOP with it.
- Checking a single case file needs neither tool at run time. It runs the evaluator compiled from the Dafny proofs to JavaScript, with Z3 as a cross-check that the two read every case alike. What's still trusted: the statements of the lemmas (a person must read them), the small adapter that reads a case's values and builds the Dafny values (`core/evaluate.ts`), and Dafny's verifier and compiler. The build refuses a proof that takes anything on trust (`assume`, `{:axiom}`, `{:verify false}`).

## Model calls can't be verified, so they only propose
Models turn the SOP into rules, gather facts and make judgment calls. A small core of plain code checks: the rule evaluator, ownership completeness, the quote check, and the provenance and reason rules. Dafny proves only that core. Every model output passes through it or through a person:

| Model output | How it's checked |
| --- | --- |
| SOP turned into rules | Z3 findings, a backtest on past decisions, and a person approves each version |
| Facts from documents | Quote check; a check for documents that contradict each other |
| Web evidence | Provenance rules (SOP 4.4) |
| Judgment calls | Typed reasons checked by rules; a person sees the rest |

Pitch claim: "every model output passes through a verified check or a person", not "Resolve is verified".

## Where each kind of breakage gets caught

| What breaks | Caught by | Gap |
| --- | --- | --- |
| SOP logic inconsistent (dead rule, hidden unknown) | Z3 | None for the kinds of problem we ask about |
| SOP logic consistent but wrong (20% where it should be 25%) | Backtest on past decisions; the person approving the spec | Z3 can't know intent |
| Resolve's own code has a bug | Dafny | Only for the core it proves |
| Evidence missing | Required-fact checks, ownership completeness, unknown handling | None: deterministic |
| Evidence made up | Quote check (plain text search) | None for the quote itself; whether the value follows from a real quote is the evidence system's job (issue #11) |
| Evidence misread (real quote, wrong meaning) | The evidence system, outside Resolve (see "The evidence boundary" in DECISIONS.md): a second independent reader, whose disagreements go to a person. Resolve adds rules on typed reasons | Some slips through; rate measured on the synthetic cases |
| Evidence miscategorized (wrong industry code) | Same as misread | Same |
| Evidence false (forged document, wrong story) | Only if documents contradict each other or other evidence in the file | Out of scope for this product. 1010.230(b)(2) allows reliance only when nothing the bank knows calls the information into question, so contradictions with screening or web results are flagged too |

Every case file records which checks passed and the evidence behind each fact, so an error found later can be pinned to one row. That is what the improve loop learns from.

## What Resolve can't catch

Resolve checks the SOP and derives the outcome from the facts it is given. A mistake made before the facts reach it passes straight through:
- **A wrong value is used as written.** A cannabis dispensary recorded as industry `normal` is approved. A wrong share is added up exactly. Only the evidence layer and its second reader can catch these (the table above).
- **A policy call hidden in a classification stays hidden.** Whether hemp CBD is a "marijuana-related business" is a policy question. The SOP doesn't answer it, and Resolve can't see that one was decided. The evidence contract asks the evidence layer to write `unknown` and say why, so that a person rules on it (`docs/INTERFACE.md`, "Case files").
- **A word Resolve doesn't know is not a mistake it catches, only one it won't act on.** A value outside the spec's list, or outside the SOP words its `maps` know, is read as unknown. That costs incomplete cases, never a wrong approval or decline.
- **One value per fact.** A business in two industries can only be recorded as one, so the more severe outcome can be missed. This is a limit of the KYB spec as written, not of the core.

## Evals vs Resolve
Evals run offline on cases with known answers and give a rate ("right 95% of the time"). They can't say which of today's live cases are in the wrong 5%, and live cases have no answer key. Resolve checks each live case as it runs. Both are needed: the 60 synthetic cases are the eval of Resolve itself.

## Scope
The maintainer challenged the scope as devil's advocate, then confirmed: stay ambitious, cut nothing. Build in layers so something always works:
1. Per-case checker, Z3 SOP checks with the brute-force agreement test, eval harness and model ladder.
2. Then Dafny proofs of the core, the second reader, and the real UK company slice.

Z3 only checks what is in the rules. The trust gap and the undefined "material" in 4.4 are found by Claude reading the SOP against the FinCEN rule, not by Z3. Z3 can also answer "unknown" (gave up); that is shown as not decided, never as a pass or a counterexample.
