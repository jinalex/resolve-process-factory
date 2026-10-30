# Improvement rounds: the agent's setup, scored by Resolve

60 synthetic KYB cases (bench/cases.ts), mocked evidence, SOP as written, end to end with Resolve. Each round is one version of the agent's setup: model, effort and review notes (bench/notes/versions.json), compared with the best setup so far: the one in use, or a later one recommended over it. Correct: every run of the case agrees with the approved spec on the full facts. Complete: every run submitted, and Resolve left open only what the full facts leave open too.

| Round | Setup | Runs | Correct | Complete | Failure groups | Cost per case | Turns per case | Evidence calls per case | Time per case | Recommendation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | v1: Opus 5.5 high | 180 | 60/60 | 60/60 | none | $0.0369 | 4.0 | 2.3 | 11.3 s | v1 is in use. |
| 2 | v2: Haiku 5.5 low | 180 | 60/60 | 60/60 | none | $0.0011 | 4.1 | 2.2 | 6.3 s | Accept v2: cost down 97%, time down 44%, nothing got worse. |
| 3 | v3: Haiku 5.5 low · notes kyb-v2 | 180 | 60/60 | 60/60 | none | $0.0011 | 4.1 | 2.4 | 6.3 s | Keep v2: no gain on any measure (a change under 10%, or of 2 cases or fewer, is within rerun noise). |

Resolve makes the decision, so a setup can only change how completely, quickly and cheaply the agent gathers; a round with no failure groups is judged on cost and speed.
