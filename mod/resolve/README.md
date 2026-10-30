# Resolve (Claude Code mod)

A pane beside the chat for turning a compliance SOP into a checked spec, running that spec on cases, and improving the processing.

## Install

```
/plugin install resolve --marketplace jinalex/resolve-process-factory
```

The repo is private, so this needs read access to it. To work on the mod from a checkout instead: `claude --plugin-dir mod/resolve`.

Checks: `claude plugin validate mod/resolve`, `claude plugin test mod/resolve`, and `npx tsc -p mod/resolve`. The type check needs the plugin API types, which Claude Code writes into `mod/resolve/.claude-plugin/types/` (gitignored) each time it loads the mod.

## Use

- `/resolve` opens the pane. A stage strip at the top, **Rules · Cases · Rounds**, marks each stage: gold with a count when it needs you, Claude's colour while Claude works on it, green when done.
  - **Rules** is one queue. The next question is on top (findings that can change a decline or an approve first, then by how many past cases an option flips), with its numbered options and what each would change; then **Up next**, **What your answers changed** on a later version, and **Done**. Answers wait in a send bar until **Send to Claude**; with nothing left to answer, the top card approves the version.
  - **Cases** sorts the cases into needs a look, escalated or declined, and clean; each opens to its case file.
  - **Rounds** leads with the latest round's score and its biggest failure group, then every round and accepting a skill version.
- It reads `.resolve/spec.json`, `.resolve/cases.json`, `.resolve/rounds.json` and `.resolve/status.json` in the project, appends the owner's answers to `.resolve/answers.jsonl`, and offers a built-in sample run until those exist. `pnpm resolve` at the repo root writes the first two from the KYB spec and example cases.
- Buttons append to `.resolve/answers.jsonl` and put a message for Claude in the prompt box.

The data format is in [docs/INTERFACE.md](../../docs/INTERFACE.md). The layout follows the v2 design (stage strip, one ranked queue), drawn with what the pane has today. While Claude works, the activity line shows with ✻ and its progress; otherwise it is a dim footnote.
