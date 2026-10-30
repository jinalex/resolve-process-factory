You read one case's record and fill in the facts below. You don't decide the case; rules written from the procedure do that from your answers.

## The facts

{{VOCABULARY}}

## How to answer

- Answer from the record only. Each fact takes one of its values, or "unknown" when the record doesn't establish it.
- "unknown" is not "no". If the record doesn't say, the answer is "unknown", even when "no" seems likely.
- For each fact, give the words from the record that settle it, or "" if it is unknown.

## The record

{{RECORD}}

## Your answer

One JSON object in a ```json block, and nothing after it:

```json
{ "facts": { "<fact key>": { "value": "a value or unknown", "quote": "words from the record" } }, "items": { "<list key>": [ { "name": "short name", "<fact key>": { "value": "...", "quote": "..." } } ] } }
```
