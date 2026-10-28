# What the Resolve screens read and write

Agreed between the UX thread and the logic thread ("Critique the Resolve spike approach"), 2026-10-26; v2 additions (severity, impact, applied, status.json, send) agreed later that day; `proof` and `skill_diff` added for the technical demo pass. The logic thread's proposals ([../resolve-logic/INTERFACE-changes.md](../resolve-logic/INTERFACE-changes.md)) are all adopted here.

The pane is a viewer plus a few buttons. The logic (spec checker, case runner, verifier) writes three JSON files into `.resolve/` at the project root; the pane re-reads them every two seconds. When a person presses a button, the pane appends one line to `.resolve/answers.jsonl` and puts a message for Claude in the prompt box.

Every text field is shown to a compliance person as-is: plain sentences, SOP section numbers ("3.3"), no rule IDs. Sample data in this exact shape: [sample/](sample/).

## spec.json (Spec tab)

```json
{
  "version": 2,
  "approved": false,
  "sop_title": "KYB onboarding SOP",
  "sop_doc": "https://claude.ai/artifact/...",
  "sop": [ { "ref": "3.3", "text": "Unless the entity is excluded ...", "rules": ["own-complete"] } ],
  "rules": [ { "id": "own-complete", "says": "If someone unidentified could still own 25% or more, request documents.", "sop_refs": ["3.3"], "code": "..." } ],
  "facts": [
    { "key": "sanctions", "name": "Sanctions screening", "values": ["none", "potential", "confirmed", "unknown"],
      "required_by": ["4.1", "4.2"], "evidence": "Screening result for the business and every identified person" }
  ],
  "findings": [
    {
      "id": "unknown-vs-escalate",
      "kind": "unknowns",
      "sop_refs": ["2.1", "2.2", "4.1"],
      "title": "An escalation can hide a decline",
      "example": "A PEP is found, and sanctions screening hasn't come back yet.",
      "example_facts": [ { "key": "pep", "name": "Politically exposed", "value": "yes" },
                         { "key": "sanctions", "name": "Sanctions screening", "value": "unknown" } ],
      "explain": "Under 2.1 this escalates. If screening comes back as a confirmed match, the right answer was decline.",
      "question": "When a fact that could lead to a decline is still unknown, should the case go back as incomplete first?",
      "options": ["Yes, incomplete first", "No, escalate now"],
      "severity": "high",
      "impact": [
        { "option": "Yes, incomplete first", "flips": [ { "case_id": "C-1088", "from": "escalate", "to": "incomplete" } ], "matches_past": 41 },
        { "option": "No, escalate now", "flips": [], "matches_past": 40 }
      ],
      "answer": null,
      "proof": { "asks": "Can any case reach rule 5.3 when 5.1 already applies?", "code": "s.add(msb, licensed_missing) ...",
                 "answer": "unsat", "ms": 41 }
    }
  ],
  "applied": [ { "id": "msb-licence", "applied_in": 2 } ],
  "changes_from_previous": [
    { "from": "escalate", "to": "incomplete", "example": "A PEP is found and sanctions screening hasn't come back yet.", "example_facts": [] }
  ],
  "past_cases": [
    { "case_id": "C-1042", "name": "Bluefin Logistics LLC", "past_decision": "approve", "spec_decision": "request_docs",
      "why": "Owners on file add up to 70%. The other 30% is unaccounted for.", "verdict": null }
  ]
}
```

- `sop_title` and `sop_doc`: the SOP's name and its Claude Doc link. Clicking the version in the pane's title line opens it.
- `kind`: gap, contradiction (dead rules fold in here), unknowns, judgment, or uncovered (SOP text with no rule).
- A finding may carry `ownership` (same shape as a case's) when ownership is the point. `answer` is null or `{ "choice", "at" }`.
- Z3 supplies kind, sections, example, example_facts and explain; Claude writes question and options.
- `example_facts`: a fact about one item of a list (a person, an expense line) carries `list` (e.g. "people") and `item`, counting from 1. Z3's examples are made-up cases, so items have numbers, not names; the pane shows "person 1".
- `facts`: every fact the spec needs, with a stable `key` the verifier maps to spec variables. This is what makes "missing" checkable.
- `severity`: `high` when either option can change a decline or an approve, else `normal`. The pane ranks by severity first, then by the number of past cases that flip.
- `impact`: one entry per option. `flips` are the past cases whose outcome changes under that option (`from` is the outcome under the current spec). `matches_past` is how many past team decisions that option agrees with; the pane shows it under the button.
- `applied`: which answers a spec version has absorbed, so the pane can show pending vs applied.
- `changes_from_previous`: kinds of case whose outcome flips between versions, so a reviewer approves a change by seeing what flips, not by reading rules.
- `proof`: optional, for "Show the logic" in the technical demo. `asks` is the check in plain words, `code` the Z3 query in its Python form, trimmed to the rules involved, `answer` sat or unsat (with a counterexample in `example_facts` when sat), `ms` the solve time.
- `verdict`: null, `past_right` (becomes a spec correction) or `spec_right` (the old decision was a probable team error).

## cases.json (Process tab)

```json
{
  "skill_version": 3,
  "cases": [
    {
      "id": "C-2001", "name": "Northwind Coffee Co.",
      "outcome": "request_docs",
      "decided_by": "3.3: ownership isn't complete",
      "missing": ["Find the owners of Halcyon Holdings LLC (holds 40%). Without them, someone could own 25% or more."],
      "tool_calls": 14,
      "ownership": {
        "holders": [
          { "name": "Dana Ruiz", "type": "person", "pct": 35, "verified": true, "source": "Cap table" },
          { "name": "Halcyon Holdings LLC", "type": "entity", "pct": 40, "owners": null, "source": "Cap table" }
        ],
        "unaccounted_pct": 25
      },
      "facts": [
        { "key": "control_person", "name": "Control person", "value": "Dana Ruiz, CEO", "source": "Operating agreement p.3", "how": "judgment", "by": "Jev", "confidence": 0.95 },
        { "key": "pep", "name": "Politically exposed", "value": "no", "source": "Screening vendor", "how": "lookup" }
      ],
      "check": { "passed": true, "problems": [], "expected": "request_docs" }
    }
  ]
}
```

- `outcome`: approve, incomplete, request_docs, escalate or decline.
- `how`: `lookup` (read from a document) or `judgment` (a decision model call, with `by` and `confidence`). A fact nobody established has `"value": "unknown"`.
- `ownership` is raw data. The verifier computes completeness from it and writes `missing[]`; "ownership complete" is never something the agent asserts. `type` is person, entity or pool. An entity's `owners` is null when unknown, or a list of holders. Omit the block for excluded entities and nonprofits.
- `check.passed` = consistent: the file meets every evidence requirement and the outcome follows from the facts under the spec. `problems` says why not, in plain sentences. `expected` is present only on cases with a known answer.

## status.json (stage strip and activity line)

```json
{ "stage": 1, "state": "working", "activity": "Re-deciding 60 past cases…", "progress": [23, 60], "updated_at": "2026-10-26T20:10:00Z" }
```

Rewritten by the logic at each step. `state` is `working`, `needs_review`, `waiting` or `done`. `progress` is optional. Missing file = idle.

## rounds.json (Improve tab)

```json
{
  "accepted_version": 2,
  "rounds": [
    { "n": 3, "skill_version": 3, "passed": 57, "correct": 52, "total": 60, "got_worse": ["C-2017"],
      "groups": [ { "cause": "Missed an owner held through a second company", "cases": ["C-2004", "C-2031"],
                    "change": "Open every company that owns a share until only people remain." } ],
      "back_to_spec": ["C-2050: the SOP doesn't say what to do when the state registry is down"],
      "skill_diff": [ { "group": "Missed an owner held through a second company",
                        "removed": ["Read the cap table."],
                        "added": ["Read the cap table. For every company listed, open its own owners until only people remain."] } ] }
  ]
}
```

Two scores, because they diverge. `passed` counts consistent case files. `correct` counts outcomes matching `expected` (planted truth, or settled past decisions). A file can be consistent and still miss an owner, so the loop is judged on `correct`, and `passed` guards against sloppy files. `got_worse` = correct last round, wrong now. `skill_diff` = the skill lines this round changed, grouped by the failure that prompted them (for the Rounds drill-down).

## answers.jsonl (written by the pane)

```
{"type":"finding","id":"unknown-vs-escalate","choice":"Yes, incomplete first","at":"..."}
{"type":"past_case","case_id":"C-1042","verdict":"spec_right","at":"..."}
{"type":"approve_spec","version":2,"at":"..."}
{"type":"accept_skill","version":3,"at":"..."}
{"type":"send","ids":["unknown-vs-escalate","C-1042"],"at":"..."}
```

Answers are pending until a `send` line names them; the logic treats a send as one batch and answers all of it in one spec version.

The logic reads these and writes a new spec version. The pane never edits the other files, and the skill-improvement loop never edits the spec or the checker.
