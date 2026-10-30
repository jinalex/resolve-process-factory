# Results

51 labelled cases. "Open": an unknown fact stays unknown (Resolve's rule). "Closed": an unknown yes/no fact reads as no. "Premise given": every case opens "X is a telemarketer subject to the Telemarketing Sales Rule", so the facts that put the sale inside the rule are set from that sentence.

| Draft | Reader | Unknowns | Right | Review | Wrong | Violations cleared |
| --- | --- | --- | --- | --- | --- | --- |
| draft-31d52a | claude-haiku-5-5 | open | 0/51 | 51 | 0 | 0 |
| draft-31d52a | claude-haiku-5-5 | closed | 21/51 | 0 | 30 | 30 |
| draft-31d52a | claude-haiku-5-5 | premise given, open | 24/51 | 24 | 3 | 0 |
| draft-31d52a | claude-haiku-5-5 | premise given, closed | 31/51 | 0 | 20 | 3 |
| draft-5b1558 | claude-haiku-5-5 | open | 0/51 | 51 | 0 | 0 |
| draft-5b1558 | claude-haiku-5-5 | closed | 21/51 | 0 | 30 | 30 |
| draft-5b1558 | claude-haiku-5-5 | premise given, open | 24/51 | 24 | 3 | 0 |
| draft-5b1558 | claude-haiku-5-5 | premise given, closed | 31/51 | 0 | 20 | 3 |
| draft-fa084f | claude-haiku-5-5 | open | 0/51 | 51 | 0 | 0 |
| draft-fa084f | claude-haiku-5-5 | closed | 21/51 | 0 | 30 | 30 |
| draft-fa084f | claude-haiku-5-5 | premise given, open | 24/51 | 24 | 3 | 0 |
| draft-fa084f | claude-haiku-5-5 | premise given, closed | 31/51 | 0 | 20 | 3 |
| draft-31d52a | claude-opus-5-5 | open | 1/51 | 50 | 0 | 0 |
| draft-31d52a | claude-opus-5-5 | closed | 28/51 | 0 | 23 | 16 |
| draft-31d52a | claude-opus-5-5 | premise given, open | 27/51 | 23 | 1 | 0 |
| draft-31d52a | claude-opus-5-5 | premise given, closed | 34/51 | 0 | 17 | 1 |
| draft-5b1558 | claude-opus-5-5 | open | 1/51 | 50 | 0 | 0 |
| draft-5b1558 | claude-opus-5-5 | closed | 28/51 | 0 | 23 | 16 |
| draft-5b1558 | claude-opus-5-5 | premise given, open | 27/51 | 23 | 1 | 0 |
| draft-5b1558 | claude-opus-5-5 | premise given, closed | 34/51 | 0 | 17 | 1 |
| draft-fa084f | claude-opus-5-5 | open | 1/51 | 50 | 0 | 0 |
| draft-fa084f | claude-opus-5-5 | closed | 28/51 | 0 | 23 | 16 |
| draft-fa084f | claude-opus-5-5 | premise given, open | 27/51 | 23 | 1 | 0 |
| draft-fa084f | claude-opus-5-5 | premise given, closed | 34/51 | 0 | 17 | 1 |
| (no spec) | claude-haiku-5-5 answers directly | n/a | 44/51 | 0 | 7 | 1 |
| (no spec) | claude-opus-5-5 answers directly | n/a | 46/51 | 0 | 5 | 2 |
