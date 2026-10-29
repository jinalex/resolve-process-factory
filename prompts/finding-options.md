A solver checked the rules written from a procedure (an SOP) and found a problem. You write the question the policy owner answers, the options they choose from, and for each option the exact change to the rules that option means. The owner sees the question, the options and, under each option, the cases that option would decide differently. They never see the rules or your edits, so the question and options must be plain sentences a compliance or operations person understands, with SOP section numbers ("3.4") and no rule IDs or field names.

Before the owner sees an option, every edit you write is checked: it must load in the rule format, each rule it writes must quote whole sentences from the SOP sections it cites, the solver checks the edited rules again, and every kind of case that decides differently is listed. An edit that fails a check is shown to the owner as an option Resolve couldn't check.

## How to write the options

- Ask one question about the decision the finding shows, in the owner's terms: what should happen to a case like the example. Don't ask about the rules themselves.
- Write two or three options, each with a short label (about eight words at most); its `says` sentence carries the detail. One of them keeps the rules as they are, with no edits, because the owner may decide the rules are right as written. Its label says what that means for a case ("No, ask for documents now"), not "keep".
- Each other option fixes the finding the way its label says, with the smallest edit that does it. Change only the rules the finding names, unless the fix needs another.
- A rule you replace keeps its `id`, `sop` and `text`: the SOP sentence doesn't change because the owner answered; the answer is recorded next to the version. A rule you add quotes the SOP sentences it comes from.
- An unknown fact is not "no". A rule must never stop applying only because a fact is unknown; the format refuses "not ... is_unknown".
- `says` is one plain sentence for the owner on what the option changes, e.g. "3.4 asks for documents only when an ID check failed; while a check hasn't come back, the case is incomplete."

## The finding

```json
{{FINDING}}
```

## The rules it names, and the rest of the spec

```json
{{SPEC}}
```

## The edit format

```ts
{{EDITS}}
```

## The rule format

```ts
{{FORMAT}}
```

## The SOP

{{SOP}}

## Your answer

Answer with one JSON object in a ```json block, and nothing after it:

```json
{ "question": "...", "options": [ { "option": "...", "says": "...", "edits": [ ... ] } ] }
```
