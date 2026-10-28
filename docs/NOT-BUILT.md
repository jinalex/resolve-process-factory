# Alternatives we didn't build

Ideas we tried or considered and set aside, with the reason. Some may come back; those say what would change our mind.

## Transaction-monitoring alert review
The first spike. A hidden AML policy, about 600 synthetic alerts, and a correction loop: Opus compiled the SOP to 19 rules (85.0% on held-out alerts), and 20 reviewer corrections took it to 96.3% with no regressions. Two problems ended it. The alerts were clean precomputed fields, so the real work of alert review, gathering information, was missing. And plain prompting beat the rules: Opus with the same reviewer notes in its prompt reached 99.3%, with no flips on a rerun. We moved to KYB, where evidence gathering is the work and its obligations can be checked.

## Prompting with reviewer notes instead of rules
The strongest baseline from the TM spike, and the main competitor to Resolve. We kept it as a comparison, not a design. What would test it properly: as corrections grow from 20 to 100 to 300, with some that conflict, does prompting keep its accuracy and stay consistent? That experiment is planned inside the KYB world after the build.

## Lean, TLA+ and Bend for each SOP
All four languages were tried on the same SOP (`experiments/formal-compare/`). Lean proved the claims but took the most effort and gives no counterexamples by default; a compliance reviewer needs the counterexample more than the proof. Bend 2 proved three of the claims but has no tactics or arithmetic. TLA+ suits case lifecycle and deadlines, which the demo doesn't cover. We kept one idea from Bend: listing the claims in their own file, separate from the logic.

## Rewriting the SOP in controlled English
We rewrote the SOP in ASD-STE100 strict mode. The sentences got cleaner and two terms had to be defined, but both planted logic bugs survived. Clearer prose doesn't find contradictions or gaps; a solver does.

## Rejecting any change that flips a past case
The TM spike's regression gate did this, and it produced narrow, wrong fixes because some past decisions were mislabeled. Replaced by showing the flipped case to a person and asking who was right.

## A confidence cutoff for human review
An earlier plan sent judgment calls with confidence below 0.8 to a person. Dropped: Jev's probability is opaque, model confidence is often badly calibrated, and a threshold can't be audited. Replaced by typed reasons that rules check.

## Grounding every fact inside Resolve
After the #8 reviews we could have checked every value against its quote and every vendor field against its subject inside the core. That works for shares, names and dates, but not for readings like "Portland, OR" meaning the US, and it ties the core to each domain's documents. Evidence grounding is a separate system instead (issue #11). What would change our mind: a general way to check a reading against its source that doesn't need per-domain code.

## The agent adjudicating sanctions hits
Clearing a potential match is its own procedure with its own SOP. The screening file carries a disposition from an upstream step instead. In the pitch, that upstream step could be another Resolve process.

## A verification skill the agent writes for itself
Coding agents can write their own checks, but a compliance team has no unit tests to start from; the policy is the spec. Resolve's checks are approved by the team, versioned, and kept, and every correction becomes a regression case. An agent that writes its own evaluator can also pass by weakening it.

## A hosted-only prototype, or a mod-only one
A hosted page alone would hide the product, which lives beside the chat in Claude Code. A mod alone can't be opened from a link, and mods may not be enabled for every reviewer. We ship both from one core.

## Pitching the correction loop as new
AWS Automated Reasoning checks already have a correction loop (they call it a ratchet), a review screen with rule diffs, and conflict reports. Resolve's differences are elsewhere: it checks an agent-built case file and reports missing evidence, it backtests against past decisions, and it runs the review process, not just the policy check.

## Python for the core
The formal-methods experiments were in Python, and Z3 from Python was 3 to 6 times faster than from TypeScript. We chose TypeScript anyway: the checks run once per SOP version, so speed doesn't matter, and Python would have meant a second language for the mod pane and the hosted page, which must share one core.

## Considered for later
- **Datalog for ownership chains.** Could express multi-layer ownership more directly than Z3. Not needed while chains in the demo are short.
- **Catala-style SOP and logic side by side.** We borrowed its idea of exceptions grouped by section, not the language.
- **Checking only the facts a case needs.** In the TM spike a case's decision was settled after 8.4 of 17 facts on average, about 42% of the cost. Worth revisiting in the improve loop, but a policy where the most severe outcome wins still forces checking every escalation trigger.
