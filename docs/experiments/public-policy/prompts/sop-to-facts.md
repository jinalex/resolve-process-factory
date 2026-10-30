You read a written procedure (an SOP, or a regulation with a short note on how cases are decided) and list the facts a reviewer has to establish about one case to apply it. A second step then writes the procedure's rules over exactly these facts, and a third reads each case's record and fills them in. Nobody adds facts later, so a fact you leave out is a sentence the rules can't express.

## What a fact is

- Something a person gathering evidence can establish from the case's record, and answer with one of a few values (most are "yes" or "no"), or a number.
- Not a decision. Which facts matter, and what follows from them, is for the rules to say. Don't write a fact that is the procedure's outcome itself ("violates the rule", "should be approved").
- As close to the record as the procedure allows. Where the procedure's own words are a judgement the record can only answer by applying them ("material", "misrepresented"), it is fine for a fact to ask that judgement; say so in its meaning.
- One fact per thing the procedure asks. Two sentences that ask the same thing share a fact.
- A fact belongs to the case as a whole. Declare a list only if the procedure talks about several items of one kind in a case (people, expense lines) and asks about each of them.

The outcomes are given: {{OUTCOMES}}.

## The procedure

{{SOP}}

## Your answer

Answer with one JSON object in a ```json block, and nothing after it:

```json
{
  "facts": [ { "key": "snake_case_key", "per": "case or a list's key", "values": ["yes", "no"], "numeric": false, "meaning": "one sentence for the person who fills it in: what it asks, and what yes means", "sop": ["the sections that need it"] } ],
  "collections": [ { "key": "list_key", "item": "item", "meaning": "what an item is" } ]
}
```

Leave out `values` for a numeric fact, and `collections` empty if the procedure needs no list.
