# What the Resolve screens read and write

Agreed between the UX thread and the logic thread ("Critique the Resolve spike approach"), 2026-10-26; v2 additions (severity, impact, applied, status.json, send) agreed later that day; `proof` and `skill_diff` added for the technical demo pass. The logic thread's proposals are all adopted here.

The pane is a viewer plus a few buttons. The logic (spec checker, case runner, verifier) writes three JSON files into `.resolve/` at the project root; the pane re-reads them every two seconds. When a person presses a button, the pane appends one line to `.resolve/answers.jsonl` and puts a message for Claude in the prompt box.

`pnpm resolve` writes these files today from the spec, Z3's checks and the case file checks; see [What `pnpm resolve` writes](#what-pnpm-resolve-writes) for which fields it fills.

Every text field is shown to a compliance person as-is: plain sentences, SOP section numbers ("3.3"), no rule IDs. The mod's built-in sample data has this same shape.

## spec.json (Rules stage)

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
- `proof`: optional, for "Show the logic" in the technical demo. `asks` is the check in plain words, `code` the Z3 query as the core asks it (TypeScript, z3-solver), trimmed to the rules involved, `answer` sat, unsat or unknown (with a counterexample in `example_facts` when sat; the pane shows unknown as "not decided"), `ms` the solve time. A finding also carries `rule_ids`; the pane shows them only behind "Show the logic".
- `verdict`: null, `past_right` (becomes a spec correction) or `spec_right` (the old decision was a probable team error).

## cases.json (Cases stage)

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
        { "key": "control_person", "name": "Control person", "value": "Dana Ruiz, CEO", "source": "Operating agreement p.3", "how": "judgment", "by": "control-person model", "confidence": 0.95 },
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
- `check.outcome_follows`: the rules give the file's outcome on its facts. This is what Resolve itself checks, together with `missing`. Whether each fact is grounded in its evidence is a separate layer, mocked and assumed sound in the prototype.
- `check.passed` also needs the evidence checks to pass. Those come from a pack's example evidence adapter (KYB: quotes, vendor fields, the control person's reasons); `problems` and `flags` say what they found, in plain sentences, as things for a person to check. `expected` is present only on cases with a known answer.
- `notes`: plain sentences shown under the deciding sentence in the case view, e.g. a pending check that could still mean decline.

## status.json (stage strip and activity line)

```json
{ "stage": 1, "state": "working", "activity": "Re-deciding 60 past cases…", "progress": [23, 60], "updated_at": "2026-10-26T20:10:00Z" }
```

Rewritten by the logic at each step. `state` is `working`, `needs_review`, `waiting`, `done` or `failed` (the run couldn't finish; `activity` says why). `progress` is optional. Missing file = idle.

## rounds.json (Rounds stage)

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
{"type":"finding","id":"unknown-vs-escalate","rule_ids":["id-verified"],"choice":"Yes, incomplete first","spec_version":2,"at":"..."}
{"type":"past_case","case_id":"C-1042","verdict":"spec_right","spec_version":2,"at":"..."}
{"type":"approve_spec","version":2,"spec_version":2,"at":"..."}
{"type":"accept_skill","version":3,"spec_version":2,"at":"..."}
{"type":"send","ids":["unknown-vs-escalate","C-1042"],"spec_version":2,"at":"..."}
```

Every line carries the `spec_version` it answers, and a finding's answer copies its `rule_ids`, so an answer can't be read against a different spec. Answers are pending until a `send` line names them; the logic treats a send as one batch and answers all of it in one spec version.

The logic reads these and writes a new spec version. The pane never edits the other files, and the skill-improvement loop never edits the spec or the checker.

## Case files (what the evidence layer hands Resolve)

Resolve takes each fact as given. The evidence layer (mocked in this prototype by the hand-made case files) supplies them, one `Fact` each (`core/evidence.ts`): a `value`, its `source` with a `quote` or vendor `field`, and `how` (`lookup` or `judgment`).

- **The allowed values come from the spec.** The evidence layer is given each fact's values as `spec.json` publishes them (`facts[].values`, with the SOP paragraphs that use them in `required_by`). It writes one of those values, a number for a numeric fact, or `unknown`.
- **The SOP's own words are accepted too.** The spec's `maps` read the words the SOP itself uses as their value ("virtual currency" as `crypto`), whatever their case and surrounding spaces. Any other word, such as "crypto exchange", is read as unknown, so the case can be incomplete but is never approved on it.
- **Classifying is the evidence layer's job.** Deciding that a "CBD retailer" falls under one of 5.1's categories is a judgment. The evidence layer records it with `how: "judgment"` and the quote it relied on, and its second reader checks it.
- **A call the SOP doesn't settle goes to a person, not into the value.** The SOP doesn't say whether hemp CBD counts as a "marijuana-related business". In a case like that, the evidence layer writes `unknown` and says why in the case file's `reason`. The case comes out incomplete, and the policy owner's answer goes into the SOP's wording, and from there into the spec.
- **One value per fact.** KYB's `industry` holds one value. A business in two industries can only be recorded as one of them, so "most severe governs" can't see the other. Making activities a list is a planned spec and pack change.

## What `pnpm resolve` writes

`pnpm resolve [spec file] [--out dir] [--cases dir]` (`packs/kyb/pane.ts`) runs Z3's checks on the spec, derives each case file's outcome from its facts, and runs the KYB pack's example evidence checks, then writes `spec.json`, `cases.json` and `status.json` into `--out`, by default `.resolve/` at the repo root. Paths given on the command line are read from the folder it was run in. Every file is built first and written at the end, each whole and renamed into place, so the pane never reads half a file, and a run that fails partway leaves the last good run in place.

`status.json` moves from stage 1 (Z3 on the rules) to stage 2 (each case file, with `progress`). It ends at `needs_review` while a finding has no answer, a case file's outcome isn't the one the rules give, or the evidence checks left something for a person to check; otherwise `done`. A run that can't finish ends at the added state `failed`, with the reason as `activity`: a case file that isn't valid JSON, a missing folder, or a `spec.json` already in the folder that can't be read. That last one is left untouched, because it may hold the expert's answers.

**What Resolve shows and what it takes as given.** Resolve checks the SOP itself (Z3), derives the outcome from the facts it is given, and lists the facts still missing. Whether a fact is grounded in its evidence is a separate layer: in this prototype it is mocked and assumed sound. The KYB pack's evidence checks (quotes, vendor fields, the control person's reasons, adverse media's bar) are an example adapter for that layer. The pane reports what they say in `problems` and `flags`, as something for a person to check, not as something Resolve has verified. `check.outcome_follows` is Resolve's own answer: the rules give the file's outcome on its facts.

What it fills, and what it leaves to others:

- `spec.json`: `domain`, `version`, `spec_hash` (a fingerprint of the spec file), `sop_title` (the SOP's first heading), `sop`, `rules` (with `code`, the Z3 formula for when the rule applies, as `pnpm show-z3` prints it), `facts`, and `findings` with `proof`. Not yet: `changes_from_previous` and each fact's `evidence`.
- `sop` lists every numbered paragraph of the SOP in full, with the rules written from it, and the added `covered`: false for a paragraph no rule covers (KYB: 3.1), so the pane can mark it. The order and unknowns paragraphs are covered by the spec itself.
- `facts`: each fact's `values` are the ones the rules can tell apart, then `unknown`; for an open fact like country, that is the countries the rules name, then `other`. The computed facts (the unaccounted share, the share held by nobody identified, shares listed over 100%, control person identified, registry filing age) are listed too, with `computed: true`.
- Each finding starts with `question: null`, `options: []` and `answer: null`. Claude writes the question and options, and the pane writes the answer. A rerun keeps those, plus `severity` and `impact`, only for the same domain and version, and only on a finding that still says the same (its kind, title, explanation, sections and rules). `approved` carries over only when `spec_hash` is unchanged, and `sop_doc`, `applied`, `changes_from_previous` and `past_cases` when the domain and version are. `impact` needs a backtest on past cases, which isn't built, so the pane must draw a finding without it.
- A finding also carries `rule_ids`, for the logic; the pane never shows them.
- `cases.json`: one case per case file. `outcome` is what the file says; `check.spec_outcome` is what the spec gives on the file's facts. `decided_by` gives the SOP paragraphs behind the spec's outcome, with their section numbers. When the file's outcome differs it says so first ("The file says approve, but the spec gives escalate."). When a case is held back only because a fact is unknown, it says so under the unknowns paragraph (2.2) and names the rules that could apply once the fact is known. `check.outcome_follows`, `check.flags` (documents that disagree, for a person to look at without failing the file) and `notes` are filled as described above. `expected` comes from the example's planted truth. `tool_calls` and `skill_version` are null until the case runner writes case files.
- `facts` on a case has a line for every fact the spec needs, with `"value": "unknown"` and an empty `source` when the file doesn't have it. A person's fact carries `person`. The control person's value includes the role the file cites, and the added `problem` when the reasons don't meet 3.2.
- Ownership: a holder nobody has named is a `pool` named "Unidentified holders". A trust is a `pool` too, because its share stays unaccounted. An excluded entity is an `entity` with no `owners`, because 3.1 needs none. A person carries `verified` when their ID check passed. `unaccounted_pct` is null when a share can't be read as a percentage.
- `rounds.json` isn't written; the improve loop isn't built.
