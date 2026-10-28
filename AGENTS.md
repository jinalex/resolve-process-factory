# Working in this repo

Instructions for coding agents (Claude Code reads this through `CLAUDE.md`). "The maintainer" means whoever owns the repo or the PR you're working on. The design principles are in [docs/PRINCIPLES.md](docs/PRINCIPLES.md) and the decision log in [docs/DECISIONS.md](docs/DECISIONS.md).

## Pull requests

- Never push to `main`; open a PR. Describe it to the maintainer and wait for their OK before opening it (pushing to an open PR is fine). Fill in `.github/pull_request_template.md`.
- Never mention a past employer, or "how it was done at" a company, anywhere: code, docs, commits or PR text. Grep before every push.
- Name roles, not people, in anything the repo keeps: code, tests, docs, commits, PR text and review comments. Write "the maintainer" for whoever owns the repo or the PR, and name a decision by its role and date, e.g. "(policy owner, 2026-10-28)", so the text stays true when someone else picks it up.
- Stacked PRs: title them `[n/m] ...`, open the body with a "Stack n of m" header listing the stack in order, and base each PR on the one below it. Once the PR below merges, point the next one at `main`, merging `main` in rather than rebasing, so the PRs above don't need rewriting.

## Adversarial review

When a PR gets an adversarial review from other models (Codex, Grok, or similar), plus Tenki (comment `@tenki-reviewer` on the PR):

1. **Run it read-only.** Work on a checkout of the PR branch. Put the inputs and outputs in `.reviews/<pr>/` and add `.reviews/` to `.git/info/exclude` so nothing is committed. The inputs are the PR description, the code diff without lockfiles and example documents, and a `PROMPT.md` that says what to look hardest at. Give every reviewer the same prompt.
   - Codex: `codex exec --skip-git-repo-check --sandbox read-only -c model_reasoning_effort=high "$(cat .reviews/<pr>/PROMPT.md)"`
   - Grok: `grok -p "$(cat .reviews/<pr>/PROMPT.md)" -m <strongest model> --effort high --sandbox read-only --always-approve --deny 'Bash(gh *)' --deny 'Bash(git push*)' --deny 'Bash(git commit*)' --deny 'Edit' --deny 'Write'`. Under `--permission-mode dontAsk` it stops at the first refused command and gives no review.
   - Keep `sop/PLANTED.md` in the prompt's context. Following the SOP as written there is intended, not a bug.
2. **Check before fixing.** Reproduce each finding, or say it couldn't be reproduced. Sort them into spec rules that don't say what their SOP sentence says, pack code, the input edge, and tests.
3. **Bring the findings to the maintainer** before posting anything on GitHub.
4. **Fix on the PR branch**, one commit per group of findings, with a test for each counterexample.
5. **Record the review on the PR.** Post one comment on the PR with:
   - who reviewed and how (model, effort, read-only);
   - a table of the key findings: what was wrong, which reviewer found it, and the commit that fixed it;
   - anything left unfixed, and why;
   - any decision or principle that came out of it, linked to `docs/DECISIONS.md` or `docs/PRINCIPLES.md`.

   Answer each Tenki finding in its own review thread. Mention the review in the PR description's "How we know it works". A new principle or decision goes into the docs in the same PR or a linked one.
