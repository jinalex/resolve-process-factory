# Agentic review vs Resolve

60 synthetic KYB cases (bench/cases.ts), model claude-opus-5-5, effort high. Answer key: the approved spec.

## Decision only: same facts, SOP as written

| | Agentic review | Resolve |
| --- | --- | --- |
| Agrees with the approved spec | 147/180 runs (82%) | 60/60 (by construction: it is the spec) |
| Ended without a decision | 0/180 runs | 0 |
| Same case, same SOP, different outcome | 2/60 cases | 0 (deterministic) |
| Cites a section that decides the outcome (cases a rule decides) | 103/114 (90%) | every outcome a rule decides names its rule ID, SOP section and sentence |
| Time per case | 7.8 s | 2.16 ms |
| Cost per case | $0.023 | $0 |

Disagreements, by the section that decides the case under the approved spec:

- 3.4: 15 (B-001 incomplete (spec: request_docs); B-020 incomplete (spec: request_docs); B-031 incomplete (spec: request_docs); B-045 incomplete (spec: request_docs); B-057 incomplete (spec: request_docs); ...)
- 5.2: 12 (B-002 approve (spec: escalate); B-029 incomplete (spec: escalate); B-053 request_docs (spec: escalate); B-058 incomplete (spec: escalate); ...)
- 4.4: 4 (B-007 incomplete (spec: escalate); B-035 incomplete (spec: escalate))
- 4.4+5.2: 2 (B-036 incomplete (spec: escalate))

An approval no rule stops, and an incomplete case, have no deciding section, so their 66 runs aren't scored for citations.

## When the SOP changes: which past cases flip

Agentic review reruns every case under the changed SOP and is compared with its usual outcome under the old one (the majority of its 3 runs; 0 cases without a majority are left out). Resolve reruns the evaluator on every case under the changed spec, and Z3 compares the two specs on every case shape with up to two items in each list.

| Change | Flips under the spec | Resolve: time | Z3: outcome changes found, time | Agentic: moved to the new outcome | moved, to a wrong outcome | flips the change doesn't explain | missed | already on the new outcome | Agentic: time, cost to rerun |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Owners from 20% | 2 | 211 ms | 20, 6.5 s | 2 | 0 | 3 | 0 | 0 | 7.7 min of model time, $1.38 |
| Filings under 6 months | 18 | 123 ms | 2, 0.6 s | 18 | 0 | 9 | 0 | 0 | 7.5 min of model time, $1.35 |
| A pending ID check is unknown | 5 | 105 ms | 1, 0.9 s | 0 | 0 | 1 | 0 | 5 | 6.9 min of model time, $1.30 |

## End to end: the agent gathers the evidence, same mock for both arms

| | Agentic review | Agentic review + Resolve |
| --- | --- | --- |
| Cases | 20 | 20 |
| Agrees with the approved spec on the full facts | 17/20 (85%) | 20/20 (100%) |
| Approved with a fact still missing or wrong | 1 | 0 |
| Evidence requests per case | 23.3 | 23.9 |
| Trips to the evidence system per case | 2.4 | 2.5 |
| Resolve checks per case | 0.0 | 1.1 |
| Model turns per case | 3.4 | 4.3 |
| Time per case | 11.3 s | 13.7 s |
| Cost per case | $0.035 | $0.041 |

Resolve's outcome, worked out again from each run's evidence log under the current rules, matches the recorded one in 20/20 runs.

400 runs were recorded before runs carried a hash of their prompt; they are counted as recorded.
