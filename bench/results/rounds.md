# Improvement rounds: the agent's review notes, scored by Resolve

60 synthetic KYB cases (bench/cases.ts), mocked evidence, SOP as written, end to end with Resolve. Each round is one version of the review notes (bench/notes/versions.json). Correct: every run of the case agrees with the approved spec on the full facts. Complete: every run submitted, and Resolve left open only what the full facts leave open too.

| Round | Notes | Model | Runs | Correct | Complete | Failure groups | Cost per case | Turns per case | Evidence calls per case | Time per case | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | v1 | claude-haiku-5-5 low | 180 | 60/60 | 60/60 | none | $0.0011 | 4.1 | 2.2 | 6.3 s | v1 is in use. |
| 2 | v2 | claude-haiku-5-5 low | 180 | 60/60 | 60/60 | none | $0.0011 | 4.1 | 2.4 | 6.3 s | Keep v1: no gain on any measure (a change under 10% is within rerun noise). |

A round with no failure groups leaves the notes nothing to fix: Resolve makes the decision, so the notes only steer what the agent gathers.
