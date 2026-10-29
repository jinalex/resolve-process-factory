# Resolve (Claude Code mod)

A pane beside the chat for turning a compliance SOP into a checked spec, running that spec on cases, and improving the processing.

## Install

```
/plugin install resolve --marketplace jinalex/resolve-process-factory
```

The repo is private, so this needs read access to it. To work on the mod from a checkout instead: `claude --plugin-dir mod/resolve`.

## Use

- `/resolve` opens the pane. Three tabs: **Spec** (questions for the expert, past cases where the spec disagrees, approve), **Process** (every case's outcome and case file), **Improve** (pass rate per round, failures grouped by cause, accept a skill version).
- It reads `.resolve/spec.json`, `.resolve/cases.json` and `.resolve/rounds.json` in the project, and shows built-in sample data until those exist. `pnpm resolve` at the repo root writes the first two from the KYB spec and example cases.
- Buttons append to `.resolve/answers.jsonl` and put a message for Claude in the prompt box.

The data format is in [docs/INTERFACE.md](../../docs/INTERFACE.md). This is v1 of the pane; the v2 design (stage strip, one ranked queue) replaces it in a later "Mod:" PR.
