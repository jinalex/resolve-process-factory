# Resolve

Resolve checks an agent's case file against a written SOP. The demo is KYB: a bank's beneficial-ownership review. The agent gathers the facts. Resolve checks that the right evidence was collected (for example, that ownership shares add up to 100%), and that the outcome follows from the facts and the rules. An unknown fact is never treated as a "no".

## Layout

Resolve is a general core plus one pack per domain. The core knows nothing about KYB: a spec names its own outcomes and their order, its facts, the lists of items a case has (KYB: people; expenses: lines), and the facts the pack computes. A pack turns its raw case into that shape and adds any checks of its own.

- `core/spec.ts`: the rule format. Rules are data: a condition on named facts and the outcome it leads to. "some person where ..." is written `{ "some": "people", "where": ... }`.
- `core/evaluate.ts`: applies a spec to one case (every fact is one of its values or unknown; an unknown is never read as a no).
- `core/z3.ts`, `core/sop-checks.ts`: Z3 reads the same spec and checks the SOP itself: rules that can never apply, rules that treat an unknown fact differently from the unknowns rule, facts that never change an outcome, and what changes between two spec versions. `core/show-z3.ts` prints each rule's Z3 formula next to its SOP sentence.
- `core/evidence.ts`: the checks on an agent's evidence that hold in any domain: every quote is really in the cited page, vendor fields say what the file says, and the outcome follows from the facts.
- `packs/kyb/`: KYB beneficial ownership. `ownership.ts` works out who owns what across chains of companies with exact fractions; `facts.ts` computes ownership completeness, the registry filing's age and the control person. `case-file.ts` adds KYB's own checks on a case file (everyone the SOP needs is identified and screened, the control-person and adverse-media calls meet the SOP's bar, every search is recorded); hand-made case files for the examples are in `fixtures/case-files/`.
- `packs/expenses/`: employee expense claims, a second small SOP that shows the core works outside KYB: the same evaluator, Z3 checks and evidence checks.
- `sop/`: the SOPs. `kyb_sop.md` is the KYB beneficial-ownership SOP used for the demo (a fictional sponsor bank; section 3 follows 31 CFR 1010.230). `expenses_sop.md` is the expense-claims SOP.
- `spec/`: each SOP as written in the rule format (`kyb-v1.json`, `expenses-v1.json`). Each rule keeps a stable ID, its SOP section and the sentence it came from.
- `docs/INTERFACE.md`: the files the logic writes into `.resolve/` and the Resolve pane reads.
- `cases/examples/`: six KYB example cases with their documents and raw facts.
- `experiments/formal-compare/`: the same SOP written in Z3, Dafny and Lean, with raw outputs. This is the evidence for choosing Z3 for each SOP and Dafny once for the engine.

## Planned

1. Spec checker: compile the SOP to rules, run Z3 checks (gaps, conflicts, dead rules, unknown handling), version diffs, and a backtest on past cases.
2. A world of about 60 KYB cases with planted omissions.
3. Case runner: an agent that builds the case file.
4. Verifier: evidence obligations, ownership completeness, and whether the outcome follows.
5. Improve loop: Claude edits the review skill, never the spec or the checker.
6. Dafny proofs of the engine: ownership check sound for any number of owners and any depth; unknown never becomes "no"; one outcome regardless of rule order.

## Running it

Node 22.23.4 or later (the 21 October 2026 security release) runs the TypeScript directly.

```
pnpm install
pnpm test                             # both packs: outcomes, Z3's checks, Z3 agreeing with the evaluator, the case file checks
pnpm examples                         # prints each KYB example's outcome and why
pnpm check-cases                      # Resolve's checks on the six KYB example case files
pnpm check-sop                        # Z3's findings on the KYB SOP (add --json for the pane's format)
pnpm show-z3                          # each rule's Z3 formula next to its SOP sentence (add --raw for Z3's own numbers)
pnpm check-sop spec/expenses-v1.json  # the same checks on the expenses SOP
```
