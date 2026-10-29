// Reads the pane's answers.jsonl (docs/INTERFACE.md) for one spec version. Only what the owner sent counts: an
// answer is pending until a "send" line names it, and a line written against another version is left out, never
// read against this one. Anything that can't be used is reported in a plain sentence, never applied quietly.

export type FindingAnswer = { id: string; rule_ids: string[]; choice: string; at: string };
export type CaseVerdict = { case_id: string; verdict: string; at: string };
export type Answers = {
  findings: FindingAnswer[];     // sent answers to findings, the latest for each finding
  verdicts: CaseVerdict[];       // sent verdicts on past cases
  approved: boolean;             // an approve_spec line for this version and this spec
  problems: string[];
  other_versions: number;        // lines left out because they answer another version
};

type Line = Record<string, unknown> & { type?: unknown; spec_version?: unknown };

// `hash` is the spec's fingerprint. An approve_spec line approves only the spec it names: one that names another
// spec_hash, or none, can't say which spec the owner saw, so it approves nothing.
export function readAnswers(text: string, version: number, hash?: string): Answers {
  const problems: string[] = [];
  const lines: { n: number; line: Line }[] = [];
  text.split("\n").forEach((raw, i) => {
    if (!raw.trim()) return;
    try {
      const line = JSON.parse(raw);
      if (!line || typeof line !== "object" || Array.isArray(line)) throw new Error();
      lines.push({ n: i + 1, line });
    } catch { problems.push(`Line ${i + 1} of the answers isn't a JSON object, so it was left out.`); }
  });
  const mine = lines.filter(({ line }) => line.spec_version === version);
  const other_versions = lines.length - mine.length;
  const TYPES = ["finding", "past_case", "send", "approve_spec"];
  for (const { n, line } of mine) if (!TYPES.includes(line.type as string)) problems.push(`Line ${n} of the answers is a "${String(line.type)}" line, which Resolve doesn't know, so it was left out.`);

  // Every id a send names, with the line it was sent on: an answer counts as it stood when it was sent.
  const sentAt = new Map<string, number>();
  for (const { n, line } of mine) {
    if (line.type !== "send") continue;
    if (!Array.isArray(line.ids) || line.ids.some((x) => typeof x !== "string")) { problems.push(`The send on line ${n} doesn't list ids.`); continue; }
    for (const id of line.ids as string[]) sentAt.set(id, n);
  }
  const latest = (type: string, key: string, id: string) =>
    mine.filter(({ n, line }) => line.type === type && line[key] === id && n < sentAt.get(id)!).at(-1);

  const findings: FindingAnswer[] = [], verdicts: CaseVerdict[] = [];
  for (const id of sentAt.keys()) {
    const f = latest("finding", "id", id), c = latest("past_case", "case_id", id);
    // A send names ids, not what they are, so an id that is both a finding and a past case can't be read either way.
    if (f && c) { problems.push(`${id} was sent, but it names both a finding (line ${f.n}) and a past case (line ${c.n}), so neither was used.`); continue; }
    if (f) {
      const { rule_ids, choice, at } = f.line;
      if (!Array.isArray(rule_ids) || rule_ids.some((x) => typeof x !== "string") || typeof choice !== "string") { problems.push(`The answer on line ${f.n} has no rule_ids or no choice, so it can't be matched to its finding.`); continue; }
      findings.push({ id, rule_ids: rule_ids as string[], choice, at: String(at ?? "") });
    } else if (c) {
      if (typeof c.line.verdict !== "string") { problems.push(`The verdict on line ${c.n} has no verdict, so it was left out.`); continue; }
      verdicts.push({ case_id: id, verdict: c.line.verdict, at: String(c.line.at ?? "") });
    } else problems.push(`${id} was sent, but there's no answer for it on version ${version}.`);
  }
  const approved = mine.some(({ line }) => line.type === "approve_spec" && line.version === version && hash !== undefined && line.spec_hash === hash);
  return { findings, verdicts, approved, problems, other_versions };
}
