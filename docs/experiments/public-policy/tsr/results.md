# Results

51 labelled cases. "Open": an unknown fact stays unknown (Resolve's rule). "Closed": an unknown yes/no fact reads as no. "Premise given": every case opens "X is a telemarketer subject to the Telemarketing Sales Rule", so the facts that put the sale inside the rule are set from that sentence.

| Draft | Reader | Unknowns | Right | Violations caught | Clean cases cleared | Review | Wrong | Missed violations (false negatives) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| draft-31d52a | claude-haiku-5-5 | open | 0/51 | 0/30 | 0/21 | 51 | 0 | 0 |
| draft-31d52a | claude-haiku-5-5 | closed | 21/51 | 0/30 | 21/21 | 0 | 30 | 30 |
| draft-31d52a | claude-haiku-5-5 | premise given, open | 24/51 | 24/30 | 0/21 | 24 | 3 | 0 |
| draft-31d52a | claude-haiku-5-5 | premise given, closed | 31/51 | 27/30 | 4/21 | 0 | 20 | 3 |
| draft-5b1558 | claude-haiku-5-5 | open | 0/51 | 0/30 | 0/21 | 51 | 0 | 0 |
| draft-5b1558 | claude-haiku-5-5 | closed | 21/51 | 0/30 | 21/21 | 0 | 30 | 30 |
| draft-5b1558 | claude-haiku-5-5 | premise given, open | 24/51 | 24/30 | 0/21 | 24 | 3 | 0 |
| draft-5b1558 | claude-haiku-5-5 | premise given, closed | 31/51 | 27/30 | 4/21 | 0 | 20 | 3 |
| draft-fa084f | claude-haiku-5-5 | open | 0/51 | 0/30 | 0/21 | 51 | 0 | 0 |
| draft-fa084f | claude-haiku-5-5 | closed | 21/51 | 0/30 | 21/21 | 0 | 30 | 30 |
| draft-fa084f | claude-haiku-5-5 | premise given, open | 24/51 | 24/30 | 0/21 | 24 | 3 | 0 |
| draft-fa084f | claude-haiku-5-5 | premise given, closed | 31/51 | 27/30 | 4/21 | 0 | 20 | 3 |
| draft-31d52a | claude-opus-5-5 | open | 1/51 | 1/30 | 0/21 | 50 | 0 | 0 |
| draft-31d52a | claude-opus-5-5 | closed | 28/51 | 14/30 | 14/21 | 0 | 23 | 16 |
| draft-31d52a | claude-opus-5-5 | premise given, open | 27/51 | 27/30 | 0/21 | 23 | 1 | 0 |
| draft-31d52a | claude-opus-5-5 | premise given, closed | 34/51 | 29/30 | 5/21 | 0 | 17 | 1 |
| draft-5b1558 | claude-opus-5-5 | open | 1/51 | 1/30 | 0/21 | 50 | 0 | 0 |
| draft-5b1558 | claude-opus-5-5 | closed | 28/51 | 14/30 | 14/21 | 0 | 23 | 16 |
| draft-5b1558 | claude-opus-5-5 | premise given, open | 27/51 | 27/30 | 0/21 | 23 | 1 | 0 |
| draft-5b1558 | claude-opus-5-5 | premise given, closed | 34/51 | 29/30 | 5/21 | 0 | 17 | 1 |
| draft-fa084f | claude-opus-5-5 | open | 1/51 | 1/30 | 0/21 | 50 | 0 | 0 |
| draft-fa084f | claude-opus-5-5 | closed | 28/51 | 14/30 | 14/21 | 0 | 23 | 16 |
| draft-fa084f | claude-opus-5-5 | premise given, open | 27/51 | 27/30 | 0/21 | 23 | 1 | 0 |
| draft-fa084f | claude-opus-5-5 | premise given, closed | 34/51 | 29/30 | 5/21 | 0 | 17 | 1 |
| draft-31d52a | claude-haiku-5-5 agent loop | premise given, open | 30/51 | 26/30 | 4/21 | 11 | 10 | 1 |
| draft-31d52a | claude-opus-5-5 agent loop | premise given, open | 30/51 | 24/30 | 6/21 | 11 | 10 | 0 |
| (no spec) | claude-haiku-5-5 answers directly | n/a | 44/51 | 29/30 | 15/21 | 0 | 7 | 1 |
| (no spec) | claude-opus-5-5 answers directly | n/a | 46/51 | 28/30 | 18/21 | 0 | 5 | 2 |

## The held-out half

25 cases (every other case in sorted ID order) that the improve loop never saw, decided by draft-31d52a. A reader named "-notes-v1-md" read them with the notes Claude wrote from the other half.

| How | Right | Review | Wrong | Missed violations (false negatives) |
| --- | --- | --- | --- | --- |
| claude-haiku-5-5-notes-v1-md reads | 21/25 | 0 | 4 | 0 |
| claude-haiku-5-5-notes-v1-md reads, premise given | 21/25 | 0 | 4 | 0 |
| claude-haiku-5-5 reads | 0/25 | 25 | 0 | 0 |
| claude-haiku-5-5 reads, premise given | 12/25 | 12 | 1 | 0 |
| claude-opus-5-5-notes-v1-md reads | 21/25 | 1 | 3 | 1 |
| claude-opus-5-5-notes-v1-md reads, premise given | 21/25 | 1 | 3 | 1 |
| claude-opus-5-5 reads | 0/25 | 25 | 0 | 0 |
| claude-opus-5-5 reads, premise given | 13/25 | 11 | 1 | 0 |
| claude-haiku-5-5 agent loop, premise given | 16/25 | 5 | 4 | 0 |
| claude-opus-5-5 agent loop, premise given | 15/25 | 4 | 6 | 0 |
| claude-haiku-5-5 answers directly | 21/25 | 0 | 4 | 1 |
| claude-opus-5-5 answers directly | 21/25 | 0 | 4 | 1 |
