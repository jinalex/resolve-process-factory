# Why these tools

The tools Resolve is built with, and the spikes and measurements that decided each one. Each section says what the tool does here, what else we tried, what decided it, and what would change our mind. The dated discussion is in [DECISIONS.md](DECISIONS.md), and ideas we set aside are in [NOT-BUILT.md](NOT-BUILT.md).

The worked example throughout is a Know Your Business (KYB) SOP: the checks a company runs on a business customer before taking it on, such as who ultimately owns and controls it.

## Z3, run on every SOP version

**What it does here.** Z3 is an SMT solver. It checks the SOP itself, before any case runs: rules that can never apply, unknowns handled differently from the unknowns rule, facts that never change an outcome, and which cases change between two versions. Each finding comes with an example case, which is what the SOP owner answers. The code is in `core/z3.ts` and `core/sop-checks.ts`.

**What else we tried.**
- The same KYB SOP in Z3, Dafny, Lean and Bend 2 ([experiments/formal-compare/](experiments/formal-compare/)), on seven claims such as "approve is safe" and "rule 5.3 is dead".
- The same SOP as plain Python, checked by brute force, by a unit test per SOP sentence, and by property tests.
- The SOP rewritten in controlled English (ASD-STE100 strict mode).
- TLA+, set aside without a trial: it suits case lifecycles and deadlines, which the demo doesn't cover.

**What decided it.**
- An SOP owner needs the counterexample more than the proof. Z3 gives one by default. Lean proved the claims but took the most effort and gives no counterexample by default. Bend 2 proved three claims but has no tactics or arithmetic.
- The 75% shortcut was wrong only at exactly 75% (`>=` where it should be `>`). Unit tests passed and property tests missed it in 200 random cap tables. Z3 and brute force found it at once.
- Brute force found everything Z3 found on 13 facts, in 17 seconds against 0.2. But it gets about four times slower with each fact added: about 4 minutes at 16 facts, an hour at 18 and 46 days at 23. Every correction reruns all of it. Z3 stayed at 2 to 20 ms with 100 extra facts.
- Clearer prose didn't help: both planted logic bugs survived the controlled-English rewrite.
- AWS Cedar is built the same way: its compiler is proven once in Lean, and an SMT solver runs on each policy.

Brute force stays as a test: on SOPs small enough to enumerate, it checks that Z3 and the evaluator agree on every input.

**What would change our mind: a tangled SOP.** The checks split the SOP into groups of rules that share no facts and check one group at a time. If sections mostly read their own facts, the time grows in step with the number of rules: KYB copied sixteen times (224 rules) takes about 5 minutes. If nearly every rule reads facts other rules read, one group holds most of the SOP and the time grows about with the square of its size, so twice the rules is about four times the wait. No exact method avoids that, because the checks include satisfiability. Resolve reports the size of the largest group as a measure of how tangled an SOP is. KYB's rules about people already form one group, because they all read who counts on the owners list. See "Scaling the SOP checks" in [DECISIONS.md](DECISIONS.md).

## Dafny, once, for the evaluator

**What it does here.** The evaluator decides each case from the rules. It is written in Dafny (`core/dafny/evaluate.dfy`), with proofs that hold for every spec and every case: it never approves on an unknown, and filling in an unknown never undoes an answer. Dafny compiles it to the JavaScript that runs (`core/dafny/evaluate.cjs`, committed), so running Resolve needs no Dafny.

**What else we tried.** Lean, in the same trial: it worked but took the most effort. Before Dafny, the evaluator was hand-written TypeScript with property tests.

**What decided it.**
- Z3 can't prove a claim for any number of owners. Dafny proved the unbounded ownership facts in the trial with one or two hint lines.
- The proofs are about Resolve's own engine, so they are written once and rerun when the core changes. A failed proof points at Resolve's code, never at an SOP.
- It compiles to JavaScript, so the browser runs the proven code too.
- Before the swap, the Dafny and TypeScript evaluators agreed on 12,000 random specs and cases. 400 of them stay in a test.

**The cost.** The compiled code is about four times slower: about 0.8 ms a KYB case against 0.2 ms, mostly big-number arithmetic. Two proofs are still planned: that the ownership check is sound for any number of owners at any depth, and that the outcome doesn't depend on rule order. See "The evaluator in Dafny" in [DECISIONS.md](DECISIONS.md).

## TypeScript for everything

**What it does here.** One language for the core, the Claude Code mod's pane, the hosted page and the case runner. Node runs the `.ts` files directly, with no build step.

**What else we tried.** Python. The formal-methods trial was in Python, and Z3 from Python was 3 to 6 times faster than from TypeScript.

**What decided it.**
- It is the language the maintainer is most familiar with. This is a prototype, not production, so we chose the most legible option over the most performant one.
- The speed gap doesn't matter here. We ran the same checks from both: same answers every time, 65 ms against 11 for the unknowns check, 7 s against 2 for a 64-owner stress test. The checks run once per SOP version, not per case.
- The mod and the hosted page must share one core. Python would have meant a second language for both.

## The real core in the browser

**What it does here.** [Try it](https://resolve-process-factory.pages.dev/try/) runs the same core as the mod: the Dafny-compiled evaluator, Z3's checks through the `z3-solver` WebAssembly build, and what each of the owner's answers would change. Only Claude's question and options for each finding are recorded.

**What decided it.** A page that replays results can't show that the checks are real. Both halves of the core already compiled to code a browser runs.

**The cost.** Z3's WebAssembly file is 35 MB, and the first check takes about half a minute. Z3 runs on threads, which browsers only allow on a cross-origin isolated page, so the host must send two headers (COOP and COEP).

## Cloudflare Pages for the hosted site

**What it does here.** Serves [resolve-process-factory.pages.dev](https://resolve-process-factory.pages.dev): the lander, Try it, the tour and the system map. Deployed with `wrangler`.

**What else we tried.** A Claude artifact. It can't set response headers, so Z3 can't run there.

**What decided it.** Pages sets the COOP and COEP headers from a `_headers` file, and hosts static files for free. Its 25 MiB per-file limit meant splitting Z3's WebAssembly in two and joining it in the page, and self-hosting the fonts, since a cross-origin isolated page can't load them from another site without extra headers.

## A Claude Code mod as the first surface

**What it does here.** A pane beside the chat in Claude Code, installed from this repo. The SOP owner answers Z3's findings there and sees the cases and rounds. The hosted page is for anyone without the mod.

**What decided it.** A hosted page alone would hide the product, which lives beside the agent. A mod alone can't be opened from a link, and mods may not be enabled for every reviewer. Both run the same core.

**What it is not.** An operations team probably doesn't work in Claude Code. The mod is a proof of concept for how Resolve's view attaches to an agent platform, not the UI a team would use. The core doesn't depend on it: it runs headless and writes plain JSON files into `.resolve/`, and the pane only reads those files and appends the owner's answers ([INTERFACE.md](INTERFACE.md)). The hosted page draws the same output a second way. Any UI that reads that contract, inside whatever agent platform a team already uses, could show it.

## Model calls: Anthropic's SDK, one agent loop

**What it does here.** Claude drafts the spec from the SOP, writes the owner's questions and options, and runs each case as one generic agent with three tools (`runner/agent.ts`: get evidence, check with Resolve, submit a decision). Every call is recorded so a run can be replayed exactly.

**What else we tried.** The Claude Agent SDK for the case runner, the plan on 2026-10-27, and a review skill written for each SOP.

**What decided it.** The runner needs only its own three tools, and a plain loop on Anthropic's TypeScript SDK records every message plus a hash of the prompt and tools each run used. One generic agent keeps the loop from being tied to KYB.

Which model to run is a result, not a tool choice: see [bench/results/ladder.md](../bench/results/ladder.md).

## Small libraries

- **Vitest** for tests: `pnpm test` runs both packs' outcomes, Z3's checks and the agreement tests.
- **fast-check** for property tests on random specs and cases (`core/arbitrary.ts`).
- **bignumber.js**, used by the Dafny-compiled evaluator for exact numbers, so a share of exactly 25% is never rounded across a threshold.
