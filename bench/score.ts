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
// case by case over every case in the key, so a case with no run counts against the round. A case is correct when
// every run's outcome matches the answer key. It is complete when every run submitted with a final Resolve check,
// and Resolve's open notes on what the agent gathered (a more severe rule that could still apply) are exactly the
// ones the full facts leave open: none the evidence system could have closed, and none missed. Stopping early is
// complete when nothing left could change the outcome, e.g. a decline. Notes are compared as sets of facts, so
// the order the agent asked in doesn't matter. Failures are grouped by what went wrong, biggest group first.
type RoundRun = { case_id: string; outcome: string | null; stopped: string; notes: string[] | null; usd: number; turns: number; evidence_calls: number; ms: number };
export type RoundKey = { outcome: string; notes: string[] };
export type Group = { cause: string; cases: string[] };
// A note as notesFor (core/evaluate.ts) writes it: its section, the facts it waits on and the outcome it would mean.
const open = (note: string) => /^(\S+) could still apply once (.+) is known, and would mean ([^.]+)\.$/.exec(note);
// The same note whatever order its facts were asked in. A note in any other wording is compared as written.
export const canonical = (note: string) => {
  const m = open(note);
  return m ? `${m[1]}|${m[2].split(" and ").map((f) => f.trim()).sort().join("|")}|${m[3]}` : note;
};
const sameNotes = (a: string[], b: string[]) => {
  const x = [...new Set(a.map(canonical))].sort(), y = [...new Set(b.map(canonical))].sort();
  return x.length === y.length && x.every((n, i) => n === y[i]);
};
// A note's group: its section and what it would mean, without the person it names.
const group = (note: string) => {
  const m = open(note);
  return m ? `${m[1]} could still mean ${m[3]}` : `${note.split(" ")[0]} (${note.length > 60 ? `${note.slice(0, 57)}...` : note})`;
};
export function causes(r: RoundRun, key: RoundKey): string[] {
  if (r.outcome === null) return [`Ended without a decision (${r.stopped.replace(/_/g, " ")})`];
  const out: string[] = [];
  if (r.outcome !== key.outcome) out.push(`Got ${r.outcome.replace(/_/g, " ")} where the spec gives ${key.outcome.replace(/_/g, " ")}`);
  if (r.notes === null) return [...out, "No final Resolve check on the record"];
  const mine = new Set(r.notes.map(canonical)), theirs = new Set(key.notes.map(canonical));
  for (const n of r.notes.filter((n) => !theirs.has(canonical(n)))) out.push(`Submitted while ${group(n)}`);
  for (const n of key.notes.filter((n) => !mine.has(canonical(n)))) out.push(`Missed that ${group(n)}`);
  return [...new Set(out)];
}
export function round(runs: RoundRun[], key: Map<string, RoundKey>, before?: { correct: string[]; complete: string[] }) {
  const ids = [...key.keys()].sort();
  const of = (id: string) => runs.filter((r) => r.case_id === id);
  const ran = (id: string) => of(id).length > 0;
  const correct = ids.filter((id) => ran(id) && of(id).every((r) => r.outcome === key.get(id)!.outcome));
  const complete = ids.filter((id) => ran(id) && of(id).every((r) => r.outcome !== null && r.notes !== null && sameNotes(r.notes, key.get(id)!.notes)));
  const groups = new Map<string, Set<string>>();
  const add = (c: string, id: string) => groups.set(c, (groups.get(c) ?? new Set()).add(id));
  for (const id of ids.filter((id) => !ran(id))) add("No run recorded", id);
  for (const r of runs.filter((r) => key.has(r.case_id))) for (const c of causes(r, key.get(r.case_id)!)) add(c, r.case_id);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
  return {
    total: ids.length, runs: runs.length, correct: correct.length, passed: complete.length,
    // A case that passed both checks last round and fails one now.
    got_worse: before ? gotWorse(before, { correct, complete }) : [],
    groups: [...groups].map(([cause, cs]) => ({ cause, cases: [...cs].sort() })).sort((x, y) => y.cases.length - x.cases.length || x.cause.localeCompare(y.cause)),
    usd_per_case: mean(runs.map((r) => r.usd)), turns_per_case: mean(runs.map((r) => r.turns)),
    evidence_calls_per_case: mean(runs.map((r) => r.evidence_calls)), s_per_case: mean(runs.map((r) => r.ms)) / 1000,
    lists: { correct, complete },
  };
}

type Lists = { correct: string[]; complete: string[] };
// The cases that passed both checks in `base` and fail one in `now`.
export const gotWorse = (base: Lists, now: Lists) =>
  base.correct.filter((id) => base.complete.includes(id) && !(now.correct.includes(id) && now.complete.includes(id)));

// Whether to take a new setup over the one in use. Fewer correct or complete, any case that got worse, or cost,
// turns, evidence calls or time up by GAIN or more keeps the one in use. Otherwise it is taken for more than
// COUNT_NOISE cases more correct or complete, or for one of those measures down by GAIN or more. Less than that is
// what reruns of the same setup move (docs/DECISIONS.md, metric and bar: a 1 or 2 case gap on 60 cases is noise).
// The pane's change column applies the same bars to the same rounded percent (mod/resolve/hooks/register.tsx).
export const GAIN = 0.1;
export const COUNT_NOISE = 2;
// The change from a to b in whole percent, as the pane shows it; from zero, any rise is unbounded.
export const pctChange = (a: number, b: number) => (a > 0 ? Math.round((100 * (b - a)) / a) : b > 0 ? Infinity : 0);
type Scores = { version: number; correct: number; passed: number; total: number; got_worse: string[]; usd_per_case: number; turns_per_case: number; evidence_calls_per_case: number; s_per_case: number };
const MEASURES = [["usd_per_case", "cost"], ["turns_per_case", "turns"], ["evidence_calls_per_case", "evidence calls"], ["s_per_case", "time"]] as const;
export function recommend(inUse: Scores, next: Scores): { accept: boolean; text: string } {
  const keep = `Keep v${inUse.version}`;
  const bar = 100 * GAIN;
  const up = (p: number) => (p === Infinity ? "up from 0" : `up ${p}%`);
  const worse = [
    ...(next.correct < inUse.correct ? [`${inUse.correct - next.correct} fewer correct`] : []),
    ...(next.passed < inUse.passed ? [`${inUse.passed - next.passed} fewer complete`] : []),
    ...(next.got_worse.length ? [`${next.got_worse.join(", ")} got worse`] : []),
    ...MEASURES.filter(([k]) => pctChange(inUse[k], next[k]) >= bar).map(([k, name]) => `${name} ${up(pctChange(inUse[k], next[k]))}`),
  ];
  if (worse.length) return { accept: false, text: `${keep}: ${worse.join("; ")}.` };
  const gains = [
    ...(next.correct - inUse.correct > COUNT_NOISE ? [`${next.correct - inUse.correct} more correct`] : []),
    ...(next.passed - inUse.passed > COUNT_NOISE ? [`${next.passed - inUse.passed} more complete`] : []),
    ...MEASURES.filter(([k]) => pctChange(inUse[k], next[k]) <= -bar).map(([k, name]) => `${name} down ${-pctChange(inUse[k], next[k])}%`),
  ];
  return gains.length
    ? { accept: true, text: `Accept v${next.version}: ${gains.join(", ")}, nothing got worse.` }
    : { accept: false, text: `${keep}: no gain on any measure (a change under ${bar}%, or of ${COUNT_NOISE} cases or fewer, is within rerun noise).` };
}

// Each round's recommendation. The round in use says so, and one before it says it came before. Each later round is
// compared with the best setup so far: the one in use, or a later one recommended over it. Its `got_worse` is
// recounted against that same setup, so a case lost in a round in between is not hidden by comparing with a round it
// skipped. Returns the rounds with `compared_to` and `recommendation`, and the best setup's version.
type RoundScores = Omit<Scores, "version"> & { skill_version: number; lists: Lists };
export function recommendAll<R extends RoundScores>(rounds: R[], inUseVersion: number) {
  const inUse = rounds.find((r) => r.skill_version === inUseVersion) ?? rounds[0];
  let best = inUse;
  const out = rounds.map((r) => {
    if (r === inUse) return { ...r, recommendation: { accept: false, text: `v${r.skill_version} is in use.` } };
    if (r.skill_version < inUse.skill_version) return { ...r, recommendation: { accept: false, text: `Before v${inUse.skill_version}, the version in use.` } };
    const next = { ...r, got_worse: gotWorse(best.lists, r.lists) };
    const rec = recommend({ ...best, version: best.skill_version }, { ...next, version: r.skill_version });
    const scored = { ...next, compared_to: best.skill_version, recommendation: rec };
    if (rec.accept) best = r;
    return scored;
  });
  return { rounds: out, best_version: best.skill_version };
}

// The setups the maintainer accepted in the pane, from answers.jsonl read exactly as the pane reads it: a line that
// doesn't parse is skipped; an acceptance counts only for the spec the pane shows (version and hash both, as the pane
// compares them; with no spec.json nothing counts), only for a version scored, and, when the line names the setup it
// accepted, only if that is still the version's setup (the versions may have been renumbered since).
type Shown = { version?: number; spec_hash?: string } | null;
export function acceptedVersions(answers: string, shown: Shown, scored: { version: number; setup: string }[]): number[] {
  if (!shown) return [];
  const sameSpec = (x: { spec_version?: number | null; spec_hash?: string }) =>
    (x.spec_version ?? null) === (shown.version ?? null) && (x.spec_hash ?? null) === (shown.spec_hash ?? null);
  const setupOf = new Map(scored.map((v) => [v.version, v.setup]));
  return answers.split("\n")
    .flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } })
    .filter((x) => x?.type === "accept_skill" && typeof x.version === "number" && setupOf.has(x.version) && sameSpec(x) &&
      (typeof x.setup !== "string" || x.setup === setupOf.get(x.version)))
    .map((x) => x.version as number);
}

// The lines one version of the notes removed and added, against the version before it: a set difference, so a line
// moved or repeated with no new text shows no change.
export function lineDiff(before: string, after: string) {
  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
  const a = lines(before), b = lines(after);
  return { removed: a.filter((l) => !b.includes(l)), added: b.filter((l) => !a.includes(l)) };
}
