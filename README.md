# Resolve

Resolve checks an agent's KYB case file against the bank's SOP. The agent gathers the facts. Resolve checks that the right evidence was collected (for example, that ownership shares add up to 100%), and that the outcome follows from the facts and the rules. An unknown fact is never treated as a "no".

## Layout

- `sop/kyb_sop.md`: the KYB beneficial-ownership SOP used for the demo (a fictional sponsor bank; section 3 follows 31 CFR 1010.230).
- `docs/INTERFACE.md`: the files the logic writes into `.resolve/` and the Resolve pane reads.
- `docs/DECISIONS.md`: what we decided and why. `docs/PRINCIPLES.md`: the rules those decisions follow. `docs/NOT-BUILT.md`: alternatives we tried or considered and set aside. `docs/WHAT-IS-VERIFIED.md`: what each check covers and what it doesn't.
- `experiments/formal-compare/`: the same SOP written in Z3, Dafny and Lean, with raw outputs. This is the evidence for choosing Z3 for each SOP and Dafny once for the engine.

## Planned

1. Spec checker: compile the SOP to rules, run Z3 checks (gaps, conflicts, dead rules, unknown handling), version diffs, and a backtest on past cases.
2. A world of about 60 KYB cases with planted omissions.
3. Case runner: an agent that builds the case file.
4. Verifier: evidence obligations, ownership completeness, and whether the outcome follows.
5. Improve loop: Claude edits the review skill, never the spec or the checker.
6. Dafny proofs of the engine: ownership check sound for any number of owners and any depth; unknown never becomes "no"; one outcome regardless of rule order.
