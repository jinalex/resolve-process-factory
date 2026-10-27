# Decisions

Agreed with Alex in the review doc "Resolve logic: review before build" (https://claude.ai/artifact/8rNGc4Xc9CR3QExGvSQMCJ), 2026-10-26 and 27. The comment threads there hold the full discussion. Newest last.

## Case file (what the agent hands Resolve)
- Raw facts plus a proposed outcome. The agent never asserts "ownership complete" or "outcome follows"; Resolve computes those.
- Screening and ID checks are per person, so "every identified individual" is checkable.
- Every fact carries a source and an exact quote (or, for vendor JSON, a field name). Resolve's code checks the quote is in the cited page. Copying it is the job of whoever reads the document.
- Add the customer's certified owner list (31 CFR 1010.230 appendix A) and the ID record fields the rule requires: document type, number, place of issue, issue and expiry dates, discrepancy resolution.
- Customer documents are trusted unless they contradict each other (1010.230(b)(2)). Resolve flags contradictions.

## SOP
- Presented as based on FinCEN's CDD rule, 31 CFR 1010.230 (text in `sop/sources/`). None of the gaps against the rule is critical; the excluded-parent and exclusions-list gaps are fixed.
- Four deliberate problems, one per finding kind: see `sop/PLANTED.md`.
- A potential sanctions match is a lookup, not a judgment: the screening file carries its disposition (cleared or open, by whom, why), mocked as the output of an upstream process. Why: adjudicating hits is its own SOP, a nested process we don't build.
- Web evidence needs provenance (SOP 4.4): name plus one identifier; one strong source (court, regulator, established outlet) or two independent weaker ones; every search recorded.

## Judgment calls
- Each judgment (control person, industry class, material adverse media, PEP relative) carries typed reasons, and rules check the reasons against the SOP. Example: a control person's title must be one of the roles in 1010.230(d)(2).
- No confidence cutoff for sending calls to a person. Why: Jev's probability is opaque, model confidence is often poorly calibrated, and a score isn't auditable. Confidence is internal only (routing to a bigger model); measure its calibration on the synthetic cases.

## Cases
- 60 synthetic cases are the measurement set. Their web search runs over a made-up news corpus with realistic traps.
- A real slice of 5 to 10 UK companies (Companies House, OpenSanctions, live web search, through Alex's Chrome). Alex labels them. Not in headline numbers. Git-ignored under `cases/live/`.
- Everything measured, nothing staged: only the documents are synthetic; cases are frozen before the first run; results are reported whatever they show. If an agent gets a case right, that's fine.

## Metric and bar
- Story: speed and cost. A faster model with Resolve, or the same agent relying on Resolve's checks, reaching the same outcomes for less.
- Firm: no rise in dangerous approvals (approved when the answer was escalate, decline or request documents); false alarms on at most 10% of cases.
- Headline line, not a gate: half the cost or time of the strong agent alone. Plot cost against correct outcomes for every setup.
- Each setup runs 3 times; on 60 cases a 1 or 2 case gap is noise.
- Runs: a model ladder (Haiku, Sonnet, Opus, each alone and with Resolve), then the improve loop cutting cost while Resolve holds results fixed.
