# Drafting on a public policy

A spike. Everything else in the repo uses an SOP, rules, cases and an answer key that we wrote ourselves. Here the policy and the labelled cases come from other people, and Claude writes both the fact list and the rules. The drafting prompt, its checks, Z3 and the evaluator are the same ones KYB and expenses use; nothing here changes the core or a pack.

## The first policy: the FTC's Telemarketing Sales Rule (`tsr/`)

- **The rule:** 16 CFR 310.3(a)(1) and (a)(2), the disclosures a telemarketer must make before a customer pays and the things it must not misrepresent, plus the definitions from 310.2 that they use. `tsr/build_sop.py` copies the eCFR text (amended to 2025-10-01; `tsr/source/`) word for word into `tsr/sop.md`. Only the section numbers and section 1 are ours: the regulation names no outcomes and doesn't say what an unknown fact means, and the rule format needs both. Two gaps, found in review after the drafts were written: the copied text lacks the rule's footnotes 1 and 2 (now in `tsr/source/310.3-footnotes.txt`; footnote 1 makes debt-relief disclosures due before enrollment, which no draft covers), and the definitions are picked by word match, which keeps 310.2(j) "credit" for "credit card" and misses "donor" and "charitable contribution".
- **The cases:** LegalBench's `telemarketing_sales_rule` task (Jonathan H. Choi, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); source and attribution in `tsr/source/NOTICE.md`): 51 short fact patterns, each labelled "Yes" (a violation) or "No".

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

- All three drafts load, quote the rule word for word (or our section 1), account for every section, and get no Z3 findings. They decide all 51 cases the same way under every reading.
- 27 of the 30 violations come out as violations, and the other 3 go to review. Of the 21 cases labelled "No", 20 go to review and 1 is called a violation (test-42, where the rule's text asks for disclosures the story doesn't make). So Resolve decided 28 cases and got 27 right.
- With unknowns left unknown, Resolve never calls a case compliant: the short fact patterns never rule out the other prohibitions. So it can't have a false negative here, and it cleared none of the 21 clean cases. The 3 violations it didn't catch went to review.
- Opus answering directly gets 46 of 51 right, including 27 of the 28 cases Resolve decided (the same 27). It calls two violations clean (test-11, test-25); Resolve sent both to review rather than catching them. Opus has to answer Yes or No; Resolve can send a case to review.
- These numbers rely on the premise, which we supply as five scope facts (`tsr/policy.json`). Without it, 50 of the 51 cases go to review: every draft takes the scope from the rule's definition of telemarketing ("more than one interstate telephone call"), and no case says so.
- The agent loop (premise given) asks only the facts that still block a rule, about 18 questions in 2 rounds a case, and reads the record as complete. On all 51 cases: Haiku 32 right, 3 review, 16 false violations; Opus 33 right, 8 review, 10 false violations; neither has a false negative. The false violations come from reading silence as "not disclosed".
- One improve round: Claude wrote reading notes from 25 labelled cases of the learning half (the 26th was already right) and never saw the other 25. On those 25, Haiku with the notes and Resolve gets 21 right, 0 review, 4 false violations, no false negatives. Opus with the same notes gets 21 with one false negative (test-11); Opus answering directly also gets 21 with one. The notes tell the reader to fill every fact and that a topic the story never mentions is absent, which is true of these stories and not of a real file, so a person would review them before accepting. n=25 and one round: an observation, not a result.

## The second policy: SARA's tax code (`sara/`)

Sections 2 (surviving spouse, head of household) and 7703 (marital status) of the edited US tax code from SARA (Holzenberger, Blair-Stanek and Van Durme, 2020; `sara/source/`, fetched from nlp.jhu.edu/law). It is a stress test of the rule format, with no change to it. Three drafts load and quote the statute exactly. One draft (f441f4) writes no rule for 7703(b), noting that it applies only where a provision refers to it and nothing in the edited code does; Z3 then reports four of its facts as never changing an outcome. Two of the four come from 7703(b), and two from section 2 (2(b)(2)(C), a spouse who dies during the year, and 2(b)(1)(A)(i)), which that draft also left out. The other two drafts use all four and get no findings. Z3's comparison finds five to seven pairs of outcomes on which two drafts can differ (`sara/compare.json`). Most come from ranking: our section 1 states no order of outcomes, and two drafts put review above every status while the third puts it third. The build keeps paragraph titles ("In general") in the header, not the text, and makes 7703(b)'s closing words a numbered paragraph of their own, because the rule format reads two levels of numbering. No SARA case is scored: its questions ask whether a single clause applies, and a rule can't use another section's result (section 152's "qualifying child"), so those definitions become facts for the reader.
