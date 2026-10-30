# One KYB SOP in Z3, Dafny, Lean and Bend

- ../../../sop/kyb_sop.md: the SOP (fictional sponsor bank; section 3 follows 31 CFR 1010.230).
- kyb_z3.py -> out_z3.txt: `pip install z3-solver; python3 kyb_z3.py` (about 2.5 min, mostly the 64-holder and "any number" attempts).
- kyb.dfy: `dotnet tool install --global dafny --version 4.9.0; dafny verify kyb.dfy`. P4_v1 and P7 fail on purpose (both are false).
- Kyb.lean: Lean 4.12, no Mathlib: `lean Kyb.lean`. P4_v1_fails uses the counterexample Z3 found.

Checks: P1 approve is safe, P2 sanctions always decline, P3 is rule 5.3 dead, P4 answers given with unknowns never become decline,
P5 ownership completeness check is sound, P6 at most four 25% owners, P7 diff between SOP v1 and v2.
Write-up: "Tried it" section of https://claude.ai/artifact/J6LFKozt45GCDnBqHRdi2Y

- kyb_sop_ste.md: the SOP rewritten in ASD-STE100 strict mode (linter: 13 issues -> 0). Both logic bugs survive.
- bend/: Bend 2 version. kyb.bend (logic), LAWS.bend (claims), PROOF.bend (proofs), replay.bend (Z3's counterexample, evaluated).
  Run from a checkout of github.com/bendlang/bend: `cd bend2/pack && bun install; bun ../main.ts PROOF.bend`. P5-P7 not attempted.
  out_bend.txt: P1-P4 (P4 on v2) check; fail_v1.bend (run as `fail.bend` in the transcript) shows v1's P4 failing. Run without `--verdict`, which Bend says is needed for full validity.
