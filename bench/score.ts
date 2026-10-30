// How compare.ts scores runs against the answer key, kept apart so each count can be tested on its own.

export type Key = { outcome: string; sops: string[] };
type Scored = { case_id: string; outcome: string | null; agent: { sop_sections?: string[] } | null };

// Does the agent cite a section that decides the case under the approved spec? Only cases a rule decides are
// scored: an approval no rule stops, or an incomplete case, has no deciding section to cite.
export function citations(runs: Scored[], key: Map<string, Key>) {
  const scored = runs.filter((r) => (key.get(r.case_id)?.sops.length ?? 0) > 0);
  const cited = scored.filter((r) => key.get(r.case_id)!.sops.some((s) => r.agent?.sop_sections?.includes(s)));
  return { cited: cited.length, scored: scored.length, no_section: runs.length - scored.length };
}

// The outcome most runs gave, or null when no outcome has more runs than every other.
export function majority(outcomes: string[]): string | null {
  const n = new Map<string, number>();
  for (const o of outcomes) n.set(o, (n.get(o) ?? 0) + 1);
  const top = [...n].sort((x, y) => y[1] - x[1]);
  return top.length && (top.length === 1 || top[0][1] > top[1][1]) ? top[0][0] : null;
}

// What a rerun under a changed SOP did, case by case, against the agent's usual outcome before (`before`, the
// majority of its runs) and the spec's outcome before and after the change.
//   right        the spec's outcome changes and the agent moved to the new one
//   wrong        the spec's outcome changes and the agent moved, but to another outcome
//   unexplained  the spec's outcome doesn't change, and the agent's did
//   missed       the spec's outcome changes and the agent stayed on an outcome that is now wrong
//   already      the spec's outcome changes and the agent stayed, already on the new outcome
export function flips(before: Map<string, string>, after: { case_id: string; outcome: string }[], keyBefore: Map<string, Key>, keyAfter: Map<string, Key>) {
  const out = { right: [] as string[], wrong: [] as string[], unexplained: [] as string[], missed: [] as string[], already: [] as string[] };
  for (const r of after) {
    const was = before.get(r.case_id);
    if (was === undefined) continue;
    const want = keyAfter.get(r.case_id)!.outcome, touched = keyBefore.get(r.case_id)!.outcome !== want;
    if (r.outcome !== was) (touched ? (r.outcome === want ? out.right : out.wrong) : out.unexplained).push(r.case_id);
    else if (touched) (was === want ? out.already : out.missed).push(r.case_id);
  }
  return out;
}

// One rung of the model ladder: how a model and arm did end to end against the approved spec. A dangerous
// approval approves a case the spec would escalate, decline or send back for documents; a run that ended without
// a decision is counted on its own. A case is unstable when its runs gave more than one outcome.
type Rung = { case_id: string; outcome: string | null; usd: number; ms: number };
export function rung(runs: Rung[], key: Map<string, Key>) {
  const decided = runs.filter((r) => r.outcome !== null);
  const outcomes = new Map<string, Set<string | null>>();
  for (const r of runs) outcomes.set(r.case_id, (outcomes.get(r.case_id) ?? new Set()).add(r.outcome));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    runs: runs.length, cases: outcomes.size,
    correct: decided.filter((r) => r.outcome === key.get(r.case_id)?.outcome).length,
    dangerous_approvals: decided.filter((r) => r.outcome === "approve" && key.get(r.case_id)?.outcome !== "approve").length,
    no_decision: runs.length - decided.length,
    unstable_cases: [...outcomes.values()].filter((s) => s.size > 1).length,
    usd_per_case: mean(runs.map((r) => r.usd)), s_per_case: mean(runs.map((r) => r.ms)) / 1000,
  };
}

// One improvement round: a version of the agent's review notes, run end to end with Resolve on every case, scored
// case by case. A case is correct when every run's outcome matches the answer key. It is complete when every run
// submitted, and Resolve's open notes (a more severe rule that could still apply) are ones the full facts leave
// open too, so the agent stopped only where the evidence system had nothing more to give. Failures are grouped by
// what went wrong, biggest group first.
type RoundRun = { case_id: string; outcome: string | null; stopped: string; notes: string[]; usd: number; turns: number };
export type RoundKey = { outcome: string; notes: string[] };
export type Group = { cause: string; cases: string[] };
const open = (note: string) => /^(\S+) could still apply .*would mean ([^.]+)\.$/.exec(note);
export function causes(r: RoundRun, key: RoundKey): string[] {
  if (r.outcome === null) return [`Ended without a decision (${r.stopped.replace(/_/g, " ")})`];
  const out: string[] = [];
  if (r.outcome !== key.outcome) out.push(`Got ${r.outcome.replace(/_/g, " ")} where the spec gives ${key.outcome.replace(/_/g, " ")}`);
  for (const n of r.notes.filter((n) => !key.notes.includes(n))) {
    const m = open(n);
    out.push(m ? `Submitted while ${m[1]} could still mean ${m[2]}` : `Submitted with a fact still open: ${n}`);
  }
  return out;
}
export function round(runs: RoundRun[], key: Map<string, RoundKey>, before?: { correct: string[]; complete: string[] }) {
  const ids = [...new Set(runs.map((r) => r.case_id))].sort();
  const of = (id: string) => runs.filter((r) => r.case_id === id);
  const correct = ids.filter((id) => of(id).every((r) => r.outcome === key.get(id)!.outcome));
  const complete = ids.filter((id) => of(id).every((r) => r.outcome !== null && r.notes.every((n) => key.get(id)!.notes.includes(n))));
  const groups = new Map<string, Set<string>>();
  for (const r of runs) for (const c of causes(r, key.get(r.case_id)!)) groups.set(c, (groups.get(c) ?? new Set()).add(r.case_id));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    total: ids.length, runs: runs.length, correct: correct.length, passed: complete.length,
    // A case that passed both checks last round and fails one now.
    got_worse: before ? ids.filter((id) => before.correct.includes(id) && before.complete.includes(id) && !(correct.includes(id) && complete.includes(id))) : [],
    groups: [...groups].map(([cause, cs]) => ({ cause, cases: [...cs].sort() })).sort((x, y) => y.cases.length - x.cases.length || x.cause.localeCompare(y.cause)),
    usd_per_case: mean(runs.map((r) => r.usd)), turns_per_case: mean(runs.map((r) => r.turns)),
    lists: { correct, complete },
  };
}

// The lines one version of the notes removed and added, against the version before it.
export function lineDiff(before: string, after: string) {
  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  const a = lines(before), b = lines(after);
  return { removed: a.filter((l) => !b.includes(l)), added: b.filter((l) => !a.includes(l)) };
}
