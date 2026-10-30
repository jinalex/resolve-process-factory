# Why these tools

The tools Resolve is built with, and the spikes and measurements that decided each one. Each section says what the tool does here, what else we tried, what decided it, and what would change our mind. The dated discussion is in [DECISIONS.md](DECISIONS.md), and ideas we set aside are in [NOT-BUILT.md](NOT-BUILT.md).

The worked example throughout is a Know Your Business (KYB) SOP (standard operating procedure): the checks a company runs on a business customer before taking it on, such as who ultimately owns and controls it. Resolve turns the SOP into a spec: rules in a fixed JSON format, each quoting the SOP sentence it came from.

## Z3, run on every SOP version

**What it does here.** Z3 is an SMT solver: given a set of logical constraints, it finds values that satisfy them or shows that none exist. Resolve uses it to check the SOP itself, before any case runs: rules that can never decide an outcome (such as planted rule 5.3, which an earlier rule always overrides), unknowns that the rules treat differently from the SOP's own rule for unknowns, facts that never change an outcome, and which cases change between two versions. Where a finding is about how cases are decided, it comes with an example case for the SOP owner to answer. The code is in `core/z3.ts` and `core/sop-checks.ts`.

**What else we tried.**
- The same KYB SOP in Z3, Dafny and Lean, on seven claims such as "approve is safe" and "rule 5.3 is dead", and in Bend 2 on the first four ([experiments/formal-compare/](experiments/formal-compare/)).
- The same SOP as plain Python (13 facts, 276,480 possible case files), checked by brute force, by a unit test per SOP sentence, and by property tests.
- The SOP rewritten in controlled English (ASD-STE100 strict mode).
- TLA+, set aside without a trial: it suits case lifecycles and deadlines, which the demo doesn't cover.

**What decided it.**
- An SOP owner needs the counterexample more than the proof. Z3 returns one whenever a claim fails. Lean proved the claims but took the most effort and gives no counterexample by default. Bend 2 checked its four claims, but only by writing out each case by hand, with no automation to search for a proof.
- In the trial, the 75% shortcut was wrong only at exactly 75% (`>=` where it should be `>`). A unit test per sentence passed, and property tests missed it in 200 random ownership tables. Z3 and brute force found it at once.
- A unit test per SOP sentence caught the dead rule, but the obvious tests still passed with the unknowns bug in place.
- Brute force found everything Z3 found on the 13-fact SOP: about 17 seconds for all checks, against about 0.2 seconds for Z3. It gets about four times slower with each fact added. Projected from the unknowns check (3.7 s at 13 facts): about 4 minutes at 16 facts, an hour at 18 and 46 days at 23. Every correction reruns all of it, because the time depends on the SOP's size, not on what changed. Z3 stayed at 2 to 20 ms for the same check with 100 extra facts.
- Clearer prose didn't help: both planted logic bugs survived the controlled-English rewrite.

A test checks that Z3's reading of the rules and the evaluator's agree, on 300 random specs and cases each run (`core/z3.test.ts`). The Z3 encoding is tested this way, not proved. For comparison, AWS's Cedar policy language proves its translation into SMT once, in Lean, and runs a solver on each policy. Resolve has the same split between a one-off proof and a per-policy solver, but its proof covers the evaluator, not the translation.

**What would change our mind: a tangled SOP.** The checks split the SOP into groups of rules that share no facts and check one group at a time. If sections mostly read their own facts, the time grows in step with the number of rules: KYB copied sixteen times (224 rules) takes about 5 minutes. If nearly every rule reads facts other rules read, one group holds most of the SOP. These checks ask about one rule at a time with the whole group in each question, so their time grows about with the square of the group's size: twice the rules is about four times the wait. Resolve reports the size of the largest group as a measure of how tangled an SOP is. KYB's rules about people already form one group, because they all read who counts on the owners list. A heavily tangled SOP would need a different way of asking the questions, not necessarily a different solver. See [Scaling the SOP checks](DECISIONS.md#scaling-the-sop-checks-2026-10-28).

## Dafny, once, for the evaluator

**What it does here.** The evaluator decides each case from the rules. It is written in Dafny (`core/dafny/evaluate.dfy`), a language whose compiler checks proofs about the code. Two properties are proved:
- It never approves on an unknown, for every spec and every case.
- Filling in an unknown never undoes an answer, for every spec that has no rule asking whether a fact is unknown (`is_unknown`). Both packs have such a rule (KYB's ID rule 3.4 and the expenses receipt rule), so this proof doesn't cover them as written. Property tests check the same cut.

Dafny compiles the evaluator to the JavaScript that runs (`core/dafny/evaluate.cjs`, committed), so running Resolve needs no Dafny.

**What else we tried.** The hand-written TypeScript evaluator it replaced, checked by property tests. In the trial above, Lean proved the per-SOP claims but took the most effort.

**What decided it.**
- In the trial, Z3 proved the ownership claims for 4, 16 and 64 owners, but gave up after 60 seconds on the version for any number of owners, which needs a sum over the whole list. Dafny proved it with one or two hint lines. That trial covered one hard-coded SOP with a flat list of shares. The same proof for Resolve's general ownership check is still planned.
- The proofs are about Resolve's own engine, so they are written once and rerun when the core changes. A failed proof points at Resolve's code, never at an SOP.
- It compiles to JavaScript, so the browser runs the same compiled evaluator.
- Before the swap, the Dafny and TypeScript evaluators agreed on 12,000 random and mutated specs and cases. A test keeps 400 of the same kind: 200 random specs and cases, and 200 pack cases with facts changed (`core/dafny/agreement.test.ts`).

**The cost.** The compiled code is about four times slower: about 0.8 ms a KYB case against 0.2 ms, mostly big-number arithmetic. Two proofs are still planned: that the ownership check is sound for any number of owners at any depth, and that the outcome doesn't depend on rule order.

**What would change our mind.** Proofs that need many more hints than the code they cover, so that each core change costs a day of proof work. See [The evaluator in Dafny](DECISIONS.md#the-evaluator-in-dafny-2026-10-29).

## TypeScript for everything

**What it does here.** One language for the core, the Claude Code mod's pane, the hosted page and the case runner. Node runs the `.ts` files directly, with no build step.

**What else we tried.** Python. The formal-methods trial was in Python, and Z3 from Python was 3 to 6 times faster than from TypeScript.

**What decided it.**
- It is the language the maintainer is most familiar with. This is a prototype, not production, so we chose the most legible option over the most performant one.
- The speed gap doesn't matter here. We ran the same checks from both: same answers every time, 65 ms against 11 for the unknowns check, 7 s against 2 for a 64-owner stress test. The checks run once per SOP version and once per option the SOP owner is offered (about 18 seconds each on KYB), not per case.
- The mod and the hosted page must share one core. Python would have meant a second language for both.

**What would change our mind.** A production build where per-version check time matters, or a team that works in another language.

## The real core in the browser

**What it does here.** [Try it](https://resolve-process-factory.pages.dev/try/) runs the same core as the mod, live: the Dafny-compiled evaluator, Z3's checks through the `z3-solver` WebAssembly build, and what each of the owner's answers would change. Only Claude's question and options for each finding are recorded. [The tour](https://resolve-process-factory.pages.dev/tour/) is different: it replays one recorded run of the whole loop and says so.

**What decided it.** A page that only replays results can't show that the checks are real. Both halves of the core already compiled to code a browser runs.

**The cost.** Z3's WebAssembly file is 35 MB, and the first check takes about half a minute. Z3 runs on threads, which browsers only allow on a cross-origin isolated page, so the host must send two headers: Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy (COOP and COEP).

**What would change our mind.** Checks too slow to run in a browser tab, which would move them to a server.

## Cloudflare Pages for the hosted site

**What it does here.** Serves [resolve-process-factory.pages.dev](https://resolve-process-factory.pages.dev): the lander, Try it, the tour and the system map. Deployed with `wrangler`, Cloudflare's command-line tool.

**What else we tried.** A Claude artifact. It can't set response headers, so Z3 can't run there.

**What decided it.** Pages sets the COOP and COEP headers from a `_headers` file, and hosts static files for free. Its 25 MiB per-file limit meant splitting Z3's WebAssembly in two and joining it in the page. The fonts are self-hosted, since a cross-origin isolated page can't load them from another site unless that site sends extra headers.

**What would change our mind.** A need for a server: shared state between viewers, or live model calls from the page.

## A Claude Code mod as the first surface

**What it does here.** A pane beside the chat in Claude Code, installed from this repo. The SOP owner answers Z3's findings there and sees the cases and rounds. The hosted page is for anyone without the mod.

**What decided it.** A hosted page alone would hide the product, which lives beside the agent. A mod alone can't be opened from a link, and mods may not be enabled for every reviewer. Both run the same core.

**What it is not.** An operations team probably doesn't work in Claude Code. The mod is a proof of concept for how Resolve's view attaches to an agent platform, not the UI a team would use. The core doesn't depend on it: it runs headless and writes plain JSON files into `.resolve/`, and the pane only reads those files and appends the owner's answers ([INTERFACE.md](INTERFACE.md)). The hosted page draws the same output a second way. Any UI that reads that contract, inside whatever agent platform a team already uses, could show it.

## Model calls: Anthropic's SDK, one agent loop

**What it does here.** Claude drafts the spec from the SOP, writes the owner's questions and options, and runs each case as one generic agent (`runner/agent.ts`). With Resolve, the agent has three tools: get evidence, check with Resolve, submit a decision. Each run's messages are saved with a hash of the prompt and tools it used, and the spec drafts and options are saved so they can be replayed without calling the model.

**What else we tried.** The Claude Agent SDK for the case runner, which was the plan on 2026-10-27. A review skill written for each SOP.

**What decided it.** The runner needs only its own tools, and a plain loop on Anthropic's TypeScript SDK saves every message and the hash with no extra layer. One generic agent keeps the loop from being tied to KYB. See [Agentic review as the baseline](DECISIONS.md#agentic-review-as-the-baseline-2026-10-29).

**What would change our mind.** An agent that needs many general tools (files, shell, web), which the Agent SDK provides.

Which model to run is a result, not a tool choice: see [bench/results/ladder.md](../bench/results/ladder.md).

## Small libraries

- **Vitest** for tests: `pnpm test` runs both packs' outcomes, Z3's checks and the agreement tests.
- **fast-check** for property tests on random specs and cases (`core/arbitrary.ts`).
- **bignumber.js**, the number type of Dafny's JavaScript runtime, which the compiled evaluator needs. Exact ownership shares come from Resolve's own fractions of big integers (`core/frac.ts`), so a share of exactly 25% is never rounded across a threshold.
