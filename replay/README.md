# The replay page

A static page that walks through one recorded run of Resolve's loop on the Know Your Business (KYB) SOP, the checks a bank runs before it takes on a business as a customer (who owns and controls it, sanctions screening), for reviewers who can't install the mod. It shows the files `pnpm resolve` wrote at each step, the same files the pane reads (`docs/INTERFACE.md`), and calls no model and no solver. Published at https://claude.ai/artifact/CREoTtkkXtWC1YdFhhY3Ne (private until the maintainer shares it); open `replay/index.html` from a checkout to view it locally.

- `steps.json`: the steps, in order, with what ran and how long it took, a short name for the stepper, a one-line result, and `focus`: the parts of the page that carry the step's gist (highlighted; the rest fades until hovered).
- `recording/<step>/`: the `.resolve/` folder as it stood after that step (`spec.json`, `cases.json`, `status.json`, and `answers.jsonl` once the owner has answered). `recording/spec/` holds the spec versions the run wrote, `kyb-v2.json` and `kyb-v3.json`, which `pnpm next-spec` wrote into `spec/`. They were moved here because they are this run's versions, not approved specs.
- Claude's calls are saved whole in `runs/options/` (the ids are in `steps.json`).
- `style.css`: the whole look, as tokens at the top. `page.js`: draws a step from the recording. `build.ts`: builds `index.html` from all of these (`pnpm build-replay`; `--check` only compares).

## How it was recorded

On main at 157d2a4, 2026-10-29, with Claude Opus 5.5 at high effort, the KYB spec `spec/kyb-v1.json` and the six example case files:

```
pnpm resolve                              # 0-v1-checked: Z3 finds 3 problems
pnpm write-options                        # 1-v1-questions: Claude writes a question and options for each
pnpm resolve                              # 2-v1-impacts: what each option would change
# two finding lines and a send line appended to .resolve/answers.jsonl
pnpm next-spec                            # 3-v2-written: version 2, Cedar Ridge flips, 1 new finding
pnpm write-options                        # 4-v2-questions
pnpm resolve spec/kyb-v2.json             # 5-v2-impacts
# one finding line and a send line
pnpm next-spec spec/kyb-v2.json           # 6-v3-written: version 3, no findings
# an approve_spec line naming version 3's spec_hash
pnpm resolve spec/kyb-v3.json             # 7-v3-approved
```

The owner's answers were written into `answers.jsonl` by hand, in the pane's format, because the pane doesn't write send lines yet; their times are placeholders. Each step's folder was copied after its command. Steps 1 and 2 come from one folder copied before and after the second `pnpm resolve`; step 0 was written again afterwards into a fresh folder from the same spec and case files.

To record a new run, repeat the commands into a fresh `--out` folder, copy each step's folder into `recording/`, update `steps.json`, and run `pnpm build-replay`.
