// The files in .resolve/ as the pane reads them. The logic writes them, but a file can be partial (written by an older
// version, cut off, edited by hand), so each is checked here: a list that is missing becomes empty, a value that should
// be text becomes text, and a file that can't be used at all is left out with a sentence saying why. Nothing here
// decides anything; it only keeps one bad file from blanking the whole pane.
import type { Answer, CaseFile, Fact, Finding, Round, RunData, Spec, Status } from '../types'

type Obj = Record<string, unknown>
const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x)
const list = <T>(x: unknown, each: (y: unknown) => T | null = y => y as T): T[] =>
  Array.isArray(x) ? x.flatMap(y => { const v = each(y); return v === null ? [] : [v] }) : []
const text = (x: unknown) => (x === null || x === undefined ? '' : String(x))
const texts = (x: unknown) => list(x, y => (y === null || y === undefined ? null : String(y)))

export function readSpec(raw: unknown, problems: string[]): Spec | null {
  if (!isObj(raw) || typeof raw.version !== 'number') {
    problems.push("spec.json couldn't be read: it has no version.")
    return null
  }
  const finding = (f: unknown): Finding | null =>
    isObj(f) && typeof f.id === 'string'
      ? ({
          ...f, title: text(f.title), explain: text(f.explain), example: text(f.example), sop_refs: texts(f.sop_refs), options: texts(f.options),
          question: typeof f.question === 'string' ? f.question : null, answer: isObj(f.answer) ? f.answer : null,
          ...(f.rule_ids !== undefined ? { rule_ids: texts(f.rule_ids) } : {}),
          ...(f.impact !== undefined ? { impact: list(f.impact, i => (isObj(i) ? { ...i, problems: texts(i.problems), changes: list(i.changes), flips: list(i.flips), new_findings: list(i.new_findings) } : null)) } : {}),
        } as Finding)
      : null
  return {
    ...(raw as Obj),
    approved: raw.approved === true,
    sop: list(raw.sop, s => (isObj(s) ? { ...s, ref: text(s.ref), text: text(s.text), rules: texts(s.rules) } : null)),
    rules: list(raw.rules, r => (isObj(r) ? { ...r, id: text(r.id), says: text(r.says), sop_refs: texts(r.sop_refs) } : null)),
    findings: list(raw.findings, finding),
    past_cases: list(raw.past_cases, p => (isObj(p) && typeof p.case_id === 'string' ? { ...p, name: text(p.name ?? p.case_id), why: text(p.why) } : null)),
  } as Spec
}

export function readCases(raw: unknown, problems: string[]): RunData['cases'] {
  if (!isObj(raw) || !Array.isArray(raw.cases)) {
    problems.push("cases.json couldn't be read: it has no list of cases.")
    return null
  }
  const fact = (f: unknown): Fact | null => (isObj(f) ? ({ ...f, name: text(f.name), value: text(f.value), source: text(f.source) } as Fact) : null)
  const one = (c: unknown): CaseFile | null =>
    isObj(c) && typeof c.id === 'string'
      ? ({
          ...c, name: text(c.name ?? c.id), decided_by: text(c.decided_by), missing: texts(c.missing), facts: list(c.facts, fact),
          ...(isObj(c.check) ? { check: { ...c.check, passed: c.check.passed === true, problems: texts(c.check.problems), ...(c.check.flags !== undefined ? { flags: texts(c.check.flags) } : {}) } } : { check: undefined }),
        } as CaseFile)
      : null
  return { skill_version: typeof raw.skill_version === 'number' ? raw.skill_version : null, cases: list(raw.cases, one) }
}

export function readRounds(raw: unknown, problems: string[]): RunData['rounds'] {
  if (!isObj(raw) || !Array.isArray(raw.rounds)) {
    problems.push("rounds.json couldn't be read: it has no list of rounds.")
    return null
  }
  const round = (r: unknown): Round | null =>
    isObj(r) && typeof r.skill_version === 'number'
      ? ({ ...r, total: Number(r.total) || 0, passed: Number(r.passed) || 0, got_worse: texts(r.got_worse), groups: list(r.groups), back_to_spec: texts(r.back_to_spec) } as Round)
      : null
  return { ...(raw as Obj), accepted_version: typeof raw.accepted_version === 'number' ? raw.accepted_version : null, rounds: list(raw.rounds, round) } as RunData['rounds']
}

export function readStatus(raw: unknown, problems: string[]): Status | null {
  if (!isObj(raw)) {
    problems.push("status.json couldn't be read.")
    return null
  }
  return { ...(raw as Obj), activity: text(raw.activity) } as Status
}

// answers.jsonl: one JSON object per line. A line that isn't one, or a send without a list of ids, is left out, as
// core/answers.ts leaves it out.
export function readAnswerLines(file: string): Answer[] {
  return file.split('\n').flatMap(line => {
    if (!line.trim()) return []
    try {
      const a = JSON.parse(line) as unknown
      if (!isObj(a) || typeof a.type !== 'string') return []
      if (a.type === 'send' && !(Array.isArray(a.ids) && a.ids.every(x => typeof x === 'string'))) return []
      return [a as Answer]
    } catch {
      return []
    }
  })
}
