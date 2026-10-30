# Drafting on a public policy

A spike. Everything else in the repo uses an SOP, rules, cases and an answer key that we wrote ourselves. Here the policy and the labelled cases come from other people, and Claude writes both the fact list and the rules. The drafting prompt, its checks, Z3 and the evaluator are the same ones KYB and expenses use; nothing here changes the core or a pack.

## The first policy: the FTC's Telemarketing Sales Rule (`tsr/`)

- **The rule:** 16 CFR 310.3(a)(1) and (a)(2), the disclosures a telemarketer must make before a customer pays and the things it must not misrepresent, plus the definitions from 310.2 that they use. `tsr/build_sop.py` copies the eCFR text (amended to 2025-10-01; `tsr/source/`) word for word into `tsr/sop.md`. Only the section numbers and section 1 are ours: the regulation names no outcomes and doesn't say what an unknown fact means, and the rule format needs both.
- **The cases:** LegalBench's `telemarketing_sales_rule` task (Jonathan H. Choi, CC BY 4.0): 51 short fact patterns, each labelled "Yes" (a violation) or "No".

| Step | Who does it | Output |
| --- | --- | --- |
| `facts` | Claude (Opus, high effort) reads the rule and lists the facts a reviewer must establish | `tsr/vocabulary.md`, `tsr/skeleton.json` (57 facts) |
| `draft 3` | Claude drafts the spec three times with `prompts/sop-to-spec.md`; each draft gets the quote, section, format and Z3 checks | `tsr/runs/draft-*.json` |
| `read <model>` | A model reads each fact pattern into those facts, "unknown" where the text doesn't say | `tsr/runs/read-*.json` |
| `direct <model>` | Baseline: the model answers each case itself from the rule text | `tsr/runs/direct-*.json` |
| `score` | The evaluator runs each draft on each reading; the outcomes are compared with the labels | `tsr/results.md`, `tsr/runs/score.json` |

```sh
node docs/experiments/public-policy/run.ts tsr facts
node docs/experiments/public-policy/run.ts tsr draft 3
node docs/experiments/public-policy/run.ts tsr read claude-opus-5-5
node docs/experiments/public-policy/run.ts tsr direct claude-opus-5-5
node docs/experiments/public-policy/run.ts tsr score
```

More steps: `check` reruns the checks on saved drafts, `agent <model>` asks only the facts Resolve still needs (reading the record as complete), and `notes <model>` is one round of the improve loop. Claude writes reading notes from half the cases, and `read <model> --notes notes-v1.md` reads the other half with them. `node docs/experiments/public-policy/compare.ts <policy>` compares the drafts with each other, case by case, with Z3.

Every step needs `RESOLVE_ANTHROPIC_API_KEY` except `score`, `check` and `compare`, which read the saved runs.

## What came out

See `tsr/results.md` for every reading. In short, with Opus reading the cases and the cases' opening premise ("X is a telemarketer subject to the Telemarketing Sales Rule") taken as settling the rule's scope:

- All three drafts load, quote the rule word for word, account for every section, and get no Z3 findings. They decide all 51 cases the same way under every reading.
- 27 of the 30 violations come out as violations, and the other 3 go to review. No violation is called clean (no false negatives). Of the 21 cases labelled "No", 20 go to review, because the short fact patterns never rule out the other 18 prohibitions, and 1 is called a violation (test-42, where the rule's text asks for disclosures the story doesn't make).
- Opus answering directly gets 46 of 51 right, but it calls two violations clean (test-11, test-25).
- Without that premise, 50 of the 51 cases go to review: every draft takes the scope from the rule's definition of telemarketing ("more than one interstate telephone call"), and no case says so.
- After one improve round, on the 25 held-out cases: Haiku reading with Claude's notes, with Resolve deciding, gets 21 right with no false negatives (no violation called clean). Opus answering directly also gets 21, with one false negative. The notes tell the reader that a topic the story never mentions is absent, which is true of these stories and not of a real file.

## The second policy: SARA's tax code (`sara/`)

Sections 2 (surviving spouse, head of household) and 7703 (marital status) of the edited US tax code from SARA (Holzenberger, Blair-Stanek and Van Durme, 2020; `sara/source/`, fetched from nlp.jhu.edu/law). It is a stress test of the rule format, with no change to it. Three drafts load and quote the statute exactly. In one, Z3 finds that 7703(b) changes no outcome, because nothing in the edited code refers to it. The drafts disagree with each other in five to seven ways (`sara/compare.json`). No SARA case is scored: its questions ask whether a single clause applies, and a rule can't use another section's result (section 152's "qualifying child"), so those definitions become facts for the reader.
