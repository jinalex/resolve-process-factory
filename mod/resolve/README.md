# Resolve (Claude Code mod)

A pane beside the chat for turning a compliance SOP into a checked spec, running that spec on cases, and improving the processing.

## Install

```
/plugin install resolve --marketplace jinalex/resolve-process-factory
```

The plugin loads in the next session; from then on the pane opens beside the chat when a session starts. In a folder with no run yet, the pane's **Set up the real run** asks Claude to clone this repo there and run `pnpm start` (git, Node 22.23.4 or later and pnpm; no API key); in a checkout with no run yet, **Get the pane ready** runs `pnpm install` if needed, then `pnpm start`. Until then it offers a built-in sample run. To work on the mod from a checkout instead: `claude --plugin-dir mod/resolve`.

Checks: `claude plugin validate mod/resolve`, `claude plugin test mod/resolve`, and `npx tsc -p mod/resolve`. The type check needs the plugin API types, which Claude Code writes into `mod/resolve/.claude-plugin/types/` (gitignored) each time it loads the mod.

## Use

- `/resolve` opens the pane. A stage strip at the top, **Rules · Cases · Rounds**, marks each stage: gold with a count when it needs you, Claude's colour while Claude works on it, green when done.
  - **Rules** is one queue. The next question is on top (findings that can change a decline or an approve first, then by how many past cases an option flips), with its numbered options and what each would change; then **Up next**, **What your answers changed** on a later version, and **Done**. Answers wait in a send bar until **Send to Claude**; with nothing left to answer, the top card approves the version.
  - **Cases** sorts the cases into needs a look, escalated or declined, and clean; each opens to its case file.
  - **Rounds** sets the latest agent setup (model, effort and review notes) against the best setup so far: correct, complete, cost, turns, evidence calls and time, each with its change, under Resolve's recommendation to keep or accept. Accept names the setup Resolve recommends until it is in use; after that, the latest setup is only a small "Accept anyway". Then the biggest failure group and every round, one line each.
- It reads `.resolve/spec.json`, `.resolve/cases.json`, `.resolve/rounds.json` and `.resolve/status.json` in the project, appends the owner's answers to `.resolve/answers.jsonl`, and offers a built-in sample run until those exist. It checks for `packs/kyb/write-pane.ts` to tell a checkout from any other folder. `pnpm start` at the repo root writes the first two from the KYB spec and example cases, with a question for each finding where a saved reply or Claude can give one (`pnpm resolve` alone writes them without), and `pnpm improve` writes `rounds.json`.
- Buttons append to `.resolve/answers.jsonl` and put a message for Claude in the prompt box.

The data format is in [docs/INTERFACE.md](../../docs/INTERFACE.md). The layout follows the v2 design (stage strip, one ranked queue), drawn with what the pane has today. While Claude works, the activity line shows with ✻ and its progress; otherwise it is a dim footnote.
