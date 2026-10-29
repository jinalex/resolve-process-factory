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
