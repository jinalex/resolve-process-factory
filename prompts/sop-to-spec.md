You translate a written procedure (an SOP) into rules in a JSON rule format, so that a solver can check the rules and a program can apply them to each case. A person reviews your draft before it is used. The checks that run on it first: your JSON must load in the rule format, every sentence you quote must appear word for word in the SOP section you cite, every numbered SOP section must be accounted for, a solver looks for rules that can never apply and for unknown facts that change an outcome, and your draft is compared with the approved rules case by case.

## How to translate

- Translate the SOP as written. Where it is vague, contradicts itself or leaves a case out, write what it says and don't repair it; the solver's checks exist to find those problems, and a person decides how to fix the SOP.
- Use only the facts, lists and computed facts given below. Their meanings are in "What the pack supplies". If a sentence needs a fact that isn't given, don't invent one: add it to `needs`.
- Inside `some` and in a list's `counts_when`, a condition looks at one item at a time: it can use that item's facts, the facts of the case as a whole, and the computed facts.
- A fact that is unknown is not "no". Write each rule so that it applies when its facts say it applies; the rule format already treats a rule that might apply, because of an unknown fact, as the unknowns outcome.
- Each rule's `text` is the SOP sentence or sentences it comes from, copied exactly from the section named in `sop`. To quote two sentences that aren't next to each other, join them with " ... ".
- Some decisions are not outcomes: who a list's rules are about (`counts_when`), when an empty list is fine (`empty_ok_when`), a number the rules add up (a computed fact with `sum`), and what the case's words mean (`maps`). Put these in the spec too, with the SOP section and sentence they come from, so the solver and a person can see them.

## The rule format

This is the TypeScript type of a spec, with comments on what each part means.

```ts
{{FORMAT}}
```

## What the pack supplies

{{VOCABULARY}}

## Given

These parts of the spec are fixed. Copy nothing from here into your answer; they are added to your draft as they are.

```json
{{GIVEN}}
```

The outcomes are, in no particular order: {{OUTCOMES}}.

## The SOP

{{SOP}}

## Your answer

Answer with one JSON object in a ```json block, and nothing after it:

```json
{
  "order": ["the outcomes, most severe first"],
  "order_sop": "the section that sets the order",
  "unknowns": { "sop": "section", "text": "exact sentence", "then": "the outcome a case with an unknown required fact gets" },
  "collections": { "<list key>": { "counts_when": {}, "empty_ok_when": {}, "unknown_when_empty": "what is unknown when the list is empty", "sop": "section", "text": "exact sentence" } },
  "computed": [ { "key": "a number the spec adds up itself", "numeric": true, "sum": [], "sop": "section", "text": "exact sentence" } ],
  "maps": { "<fact>": { "the SOP's or case's word": "one of the fact's values" } },
  "rules": [ { "id": "short-stable-id", "sop": "section", "text": "exact sentence", "when": {}, "then": "outcome" } ],
  "sections": [ { "sop": "every numbered section, e.g. 2.1", "rules": ["ids of rules from it"], "note": "if no rule: what the section does instead" } ],
  "needs": [ { "sop": "section", "text": "exact sentence", "fact": "the fact it would need, and why none of the given facts will do" } ]
}
```

Leave out any part of a list's entry in `collections` that the SOP doesn't call for, and use empty arrays or objects where you have nothing to put.
