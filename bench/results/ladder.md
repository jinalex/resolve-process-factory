# Model ladder: end to end, alone and with Resolve

60 synthetic KYB cases (bench/cases.ts), mocked evidence, SOP as written. Each run starts with only the case ID and gathers its own evidence. Answer key: the approved spec on the full facts.

| Model | Effort | Arm | Runs | Agrees with the approved spec | Dangerous approvals | No decision | Cases with more than one outcome | Cost per case | Time per case |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-haiku-5-5 | low | alone | 180 | 143/180 (79%) | 6 | 0 | 4/60 | $0.0010 | 6.8 s |
| claude-haiku-5-5 | low | with Resolve | 180 | 180/180 (100%) | 0 | 0 | 0/60 | $0.0011 | 6.3 s |
| claude-opus-5-5 | high | alone | 180 | 153/180 (85%) | 3 | 0 | 0/60 | $0.0296 | 10.5 s |
| claude-opus-5-5 | high | with Resolve | 180 | 180/180 (100%) | 0 | 0 | 0/60 | $0.0369 | 11.3 s |

A dangerous approval approves a case the spec would escalate, decline or send back for documents. Cost is at API list prices (bench/prices.ts). With Resolve, the rules decide from the evidence the agent gathered, so a wrong outcome there means the agent stopped gathering too early.
