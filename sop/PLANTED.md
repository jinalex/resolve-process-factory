# Planted problems in kyb_sop.md

The SOP is based on FinCEN's CDD rule (31 CFR 1010.230, text in `sources/`) for section 3, plus sponsor-bank policy for sections 4 to 6. Four problems are left in on purpose (one being replaced), one for each kind of finding Resolve's Spec tab shows. Don't fix them in the SOP.

| SOP | Problem | Finding kind |
| --- | --- | --- |
| 5.3 | A licensed MSB is always an MSB, so 5.2 escalates it and 2.1 ranks escalate above approve. 5.3 can never apply. | contradiction |
| (open) | To be replaced. The first version planted "a pending screening can hide behind an escalation" (2.1 ranks incomplete below escalate). That isn't a bug: escalating while a check is pending is normal (Alex, 2026-10-27). Resolve still notes a pending check that could mean decline. | unknowns |
| 3.3 | No rule for a trust owning 25% or more. The FinCEN rule, 1010.230(d)(3), says the trustee counts as the owner. | uncovered |
| 4.4 | "Material" adverse media is not defined. A person has to say what counts. | judgment |
