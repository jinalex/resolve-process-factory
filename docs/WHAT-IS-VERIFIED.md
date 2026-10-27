# What Resolve verifies, and what it doesn't

Agreed with Alex in the review doc (updated 2026-10-27 after the Codex review) "Resolve logic: review before build" (https://claude.ai/artifact/8rNGc4Xc9CR3QExGvSQMCJ, section 6 comment thread), 2026-10-27. The decisions it records are summarised in [DECISIONS.md](DECISIONS.md).

## Two checks, on two different things
- **Z3 checks the SOP.** It runs on every SOP and every new version, and finds rules that never apply, contradictions and unknowns hidden behind an escalation. If Z3 finds a problem, the SOP needs fixing.
- **Dafny will check Resolve's own code.** Planned proofs, re-run whenever that code changes, that Resolve's checking core has four stated properties for any SOP in the rule format and any case (ownership completeness sound at any depth; unknown never treated as "no"; one outcome whatever the rule order; a case missing a fact its outcome depends on is never approved). The trial so far proved facts about one hard-coded SOP with flat ownership only. If a proof fails, the first suspect is Resolve's code; it can also be a missing proof hint or a tool problem, never the SOP.
- Put simply, Dafny checks the ruler, and Z3 measures each SOP with it.
- Checking a single case file needs neither. It's plain code: a hand-written TypeScript evaluator at first, replaced by the one compiled from the Dafny proofs once they exist, with Z3 as a cross-check that the two agree.

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
| Evidence made up | Quote check (plain text search) | None for quotes |
| Evidence misread (real quote, wrong meaning) | Partly: rules on typed reasons; a second independent reader, whose disagreements go to a person | Some slips through; rate measured on the synthetic cases |
| Evidence miscategorized (wrong industry code) | Same as misread | Same |
| Evidence false (forged document, wrong story) | Only if documents contradict each other or other evidence in the file | Out of scope for this product. 1010.230(b)(2) allows reliance only when nothing the bank knows calls the information into question, so contradictions with screening or web results are flagged too |

Every case file records which checks passed and the evidence behind each fact, so an error found later can be pinned to one row. That is what the improve loop learns from.

## Evals vs Resolve
Evals run offline on cases with known answers and give a rate ("right 95% of the time"). They can't say which of today's live cases are in the wrong 5%, and live cases have no answer key. Resolve checks each live case as it runs. Both are needed: the 60 synthetic cases are the eval of Resolve itself.

## Scope
Alex challenged the scope as devil's advocate, then confirmed: stay ambitious, cut nothing. Build in layers so something always works:
1. Per-case checker, Z3 SOP checks with the brute-force agreement test, eval harness and model ladder.
2. Then Dafny proofs of the core, the second reader, and the real UK company slice.

Z3 only checks what is in the rules. The trust gap and the undefined "material" in 4.4 are found by Claude reading the SOP against the FinCEN rule, not by Z3. Z3 can also answer "unknown" (gave up); that is shown as not decided, never as a pass or a counterexample.
