import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { Answer, CaseFile, Finding, Holder, Outcome, Ownership, PastCase, Round, RunData, Spec, Status, Tab } from '../types'
import { SAMPLE } from './sample'
import { ANSWERS, V1, V2, V3 } from './tour-run'

// The logic writes spec.json, cases.json, rounds.json and status.json here; the pane
// only appends to answers.jsonl. Contract: docs/INTERFACE.md at the repo root.
const DIR = '.resolve'
const PANE = 'resolve'
const TITLE = 'Claude Resolve'

const tab = atom({ plugin: 'resolve', key: 'tab' } as const, 'spec' as Tab)
const data = atom({ plugin: 'resolve', key: 'data' } as const, null, { shape: 'run-1' })
const openCase = atom({ plugin: 'resolve', key: 'openCase' } as const, null as string | null)
const showSop = atom({ plugin: 'resolve', key: 'showSop' } as const, false)
const focus = atom({ plugin: 'resolve', key: 'focus' } as const, null as string | null)
const shown = atom({ plugin: 'resolve', key: 'shown' } as const, {} as Record<string, boolean>)
const tour = atom({ plugin: 'resolve', key: 'tour' } as const, null as number | null)
const tourPick = atom({ plugin: 'resolve', key: 'tourPick' } as const, {} as Record<string, string>)

const OUTCOME: Record<Outcome, { label: string; color: string }> = {
  approve: { label: 'Approve', color: 'success' },
  incomplete: { label: 'Incomplete', color: 'subtle' },
  request_docs: { label: 'Request documents', color: 'warning' },
  escalate: { label: 'Escalate', color: 'permission' },
  decline: { label: 'Decline', color: 'error' },
}

const KIND: Record<Finding['kind'], string> = {
  gap: 'Gap',
  contradiction: 'Contradiction',
  unknowns: 'Unknown facts',
  judgment: 'Judgment call',
  uncovered: 'Not covered',
}

let lastRaw = ''

async function readJson<T>($: EngineInterface, name: string): Promise<T | null> {
  const path = `${DIR}/${name}`
  if (!(await $.fs.exists(path))) return null
  try {
    return JSON.parse(await $.fs.read(path)) as T
  } catch {
    return null
  }
}

async function readAnswers($: EngineInterface): Promise<Answer[]> {
  const path = `${DIR}/answers.jsonl`
  if (!(await $.fs.exists(path))) return []
  const text = await $.fs.read(path)
  return text.split('\n').flatMap(line => {
    try {
      return line.trim() ? [JSON.parse(line) as Answer] : []
    } catch {
      return []
    }
  })
}

async function load($: EngineInterface) {
  const spec = await readJson<RunData['spec']>($, 'spec.json')
  const cases = await readJson<RunData['cases']>($, 'cases.json')
  const rounds = await readJson<RunData['rounds']>($, 'rounds.json')
  const status = await readJson<Status>($, 'status.json')
  const answers = await readAnswers($)
  const real = spec !== null || cases !== null || rounds !== null
  const next: RunData = real
    ? { source: 'folder', spec, cases, rounds, answers, status }
    : { source: 'sample', ...(JSON.parse(JSON.stringify(SAMPLE)) as Omit<RunData, 'source' | 'answers' | 'status'>), answers, status: null }
  const raw = JSON.stringify(next)
  if (raw === lastRaw) return
  lastRaw = raw
  await update($, data, () => next)
}

// What a press was made against: the spec on screen when its button was drawn. Each line carries it, so an
// answer is never read against a different spec, and a press whose spec changed before it was written is dropped.
type Seen = { spec_version: number | null; spec_hash?: string }
const seenOf = (d: RunData): Seen => ({ spec_version: d.spec?.version ?? null, ...(d.spec?.spec_hash ? { spec_hash: d.spec.spec_hash } : {}) })
const sameSpec = (a: { spec_version?: number | null; spec_hash?: string }, d: RunData) =>
  (a.spec_version ?? null) === (d.spec?.version ?? null) && (a.spec_hash ?? null) === (d.spec?.spec_hash ?? null)

// Lines and prompts go out one at a time, each reading the file the last one wrote, so two quick presses
// both land and a prompt never overtakes the line it is about. A failure doesn't stop the presses after it.
let queue: Promise<unknown> = Promise.resolve()

// `lines` and `prompt` may be worked out when the write runs, from the file as the presses before it left it: a send
// names every answer given by then, including one pressed a moment before the send.
type Later<T> = T | ((d: RunData) => T)

function append($: EngineInterface, later: Later<Answer[]>, seen: Seen, laterPrompt?: Later<string>) {
  const run = async () => {
    const d = await read($, data)
    const lines = typeof later === 'function' ? (d ? later(d) : []) : later
    const prompt = typeof laterPrompt === 'function' ? (d ? laterPrompt(d) : undefined) : laterPrompt
    if (lines.length && (!d || !sameSpec(seen, d))) {
      await $.ui.toast('The spec changed before that press was saved. Press it again.')
      return
    }
    if (lines.length) {
      const path = `${DIR}/answers.jsonl`
      const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
      await $.fs.write(path, before + lines.map(l => JSON.stringify({ ...l, ...seen })).join('\n') + '\n')
      await load($)
    }
    // Hand the decision to Claude in the chat; the person presses Enter to send it.
    if (prompt) await $.prompt.fill({ text: prompt })
  }
  queue = queue.then(run).catch(() => undefined)
  return queue
}

const fill = ($: EngineInterface, prompt: string) => append($, [], { spec_version: null }, prompt)

const now = () => new Date().toISOString()
const short = (t: string, n: number) => (t.length <= n ? t : `${t.slice(0, t.lastIndexOf(' ', n - 1) > n / 2 ? t.lastIndexOf(' ', n - 1) : n - 1)}…`)

// The latest answer to each finding and past case on the spec on screen, and whether a send line has named it
// since. The pane shows these over what the logic last wrote, so a press shows at once.
const sameRules = (a: string[] | undefined, b: string[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])

type Given = { choice: string; sent: boolean }
function given(d: RunData) {
  const out = new Map<string, Given & { line: Answer }>()
  // Only answers to something the spec on screen still asks: a finding with the same rules, or a past case it lists.
  const asksStill = (a: Answer) =>
    a.type === 'finding' ? !!d.spec?.findings.some(f => f.id === a.id && sameRules(a.rule_ids, f.rule_ids))
    : a.type === 'past_case' ? !!d.spec?.past_cases.some(p => p.case_id === a.case_id)
    : true
  for (const a of d.answers) {
    if (!sameSpec(a, d)) continue
    // A later answer to other rules replaces the earlier one in next-spec's eyes, so the finding is unanswered again.
    if (!asksStill(a)) { if (a.type === 'finding') out.delete(`f:${a.id}`); if (a.type === 'past_case') out.delete(`p:${a.case_id}`); continue }
    // A later answer replaces an earlier one and moves to the end, so a batch lists answers in the order given.
    const put = (k: string, g: Given & { line: Answer }) => { out.delete(k); out.set(k, g) }
    if (a.type === 'finding') put(`f:${a.id}`, { choice: a.choice, sent: false, line: a })
    else if (a.type === 'past_case') put(`p:${a.case_id}`, { choice: a.verdict, sent: false, line: a })
    else if (a.type === 'send') for (const id of a.ids) for (const k of [`f:${id}`, `p:${id}`]) { const g = out.get(k); if (g) g.sent = true }
  }
  return out
}

function findingAnswer(d: RunData, f: Finding): Given | null {
  const g = given(d).get(`f:${f.id}`)
  if (g && g.line.type === 'finding' && sameRules(g.line.rule_ids, f.rule_ids)) return g
  return f.answer ? { choice: f.answer.choice, sent: true } : null
}

function pastVerdict(d: RunData, p: PastCase): Given | null {
  const g = given(d).get(`p:${p.case_id}`)
  return g ?? (p.verdict ? { choice: p.verdict, sent: true } : null)
}

// Answers given on this spec and not yet sent to Claude.
function unsent(d: RunData) {
  return [...given(d).entries()].filter(([, g]) => !g.sent).map(([k, g]) => ({ key: k, id: k.slice(2), ...g }))
}

// The logic marks a version approved once pnpm resolve has read an approve line for its exact spec_hash.
const approved = (d: RunData) => !!d.spec?.approved
const approvalSent = (d: RunData) => d.answers.some(a => a.type === 'approve_spec' && a.version === d.spec?.version && sameSpec(a, d))

// A finding Claude has written a question for. Until then it can't be answered here.
const asked = (f: Finding) => !!f.question && f.options.length > 0

// Every outcome is drawn through this: a spec names its own outcomes (expenses: reject, return), so one the table
// doesn't know is shown by its own name, never looked up blind.
const label = (o: string | null | undefined) =>
  !o ? { label: 'no decision', color: 'subtle' }
  : (OUTCOME as Record<string, { label: string; color: string }>)[o] ?? { label: o.charAt(0).toUpperCase() + o.slice(1).replace(/_/g, ' '), color: 'subtle' }

// The stage strip's marks, one meaning each: gold needs you, Claude's colour while it works, green done, red got worse.
type Mark = 'needs' | 'working' | 'done' | 'todo' | 'worse'
const ring = (stroke: string, inner = '', dash = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.75" fill="none" stroke="${stroke}" stroke-width="1.5"${dash}/>${inner}</svg>`
const MARK: Record<Mark, { glyph: string; color?: string; svg: string }> = {
  needs: { glyph: '◉', color: 'warning', svg: ring('#C7950F', '<circle cx="7" cy="7" r="2.5" fill="#C7950F"/>') },
  working: { glyph: '✻', color: 'claude', svg: ring('#D77757', '<path d="M7 7 L7 3.5 A3.5 3.5 0 1 1 3.67 8.08 Z" fill="#D77757"/>') },
  done: {
    glyph: '✓', color: 'success',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#2E7D4F"/><path d="M4.3 7.2l1.8 1.8 3.6-3.9" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  },
  todo: { glyph: '○', svg: ring('rgba(127,127,127,0.55)', '', ' stroke-dasharray="2.2 2.2"') },
  worse: {
    glyph: '▼', color: 'error',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.5" fill="#B42318"/><path d="M4 7h6" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/></svg>',
  },
}

// A case a person should open: its outcome doesn't follow from its facts, its check failed, or something is missing or to check.
const needsALook = (x: CaseFile) =>
  x.check?.outcome_follows === false ||
  (!!x.check && x.check.outcome_follows === undefined && !x.check.passed) ||
  x.missing.length > 0 ||
  (!!x.check && (x.check.problems.length > 0 || (x.check.flags ?? []).length > 0))

// Findings Claude has asked about and past cases that decide differently, as one queue: findings that can change a
// decline or an approve first, then by how many past cases an option flips, then as written: past cases after the findings.
type QueueItem = { id: string; answer: Given | null; flips: number; high: boolean; i: number } & (
  | { type: 'finding'; f: Finding }
  | { type: 'past'; p: PastCase }
)
function rulesQueue(d: RunData, spec: Spec): QueueItem[] {
  const fs: QueueItem[] = spec.findings
    .filter(f => asked(f) || findingAnswer(d, f))
    .map((f, i) => ({ type: 'finding', id: f.id, f, answer: findingAnswer(d, f), flips: Math.max(0, ...(f.impact ?? []).map(x => x.flips.length)), high: f.severity === 'high', i }))
  const ps: QueueItem[] = spec.past_cases.map((p, i) => ({ type: 'past', id: p.case_id, p, answer: pastVerdict(d, p), flips: 0, high: false, i: fs.length + i }))
  return [...fs, ...ps].sort((a, b) => Number(b.high) - Number(a.high) || b.flips - a.flips || a.i - b.i)
}

function bar(fraction: number, width: number) {
  const filled = Math.round(fraction * width)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---- The onboarding tour ---------------------------------------------------
// A click-through of one recorded run (hooks/tour-run.ts), as the procedure's owner sees it. It draws the same
// pieces as the live pane on the recorded files, writes nothing to .resolve/ and fills no prompt.
const tourData = (v: { spec: unknown; cases: unknown }): RunData => ({
  source: 'tour', spec: v.spec as unknown as Spec, cases: v.cases as unknown as RunData['cases'], rounds: null, answers: [], status: null,
})
const T1 = tourData(V1)
const T2 = tourData(V2)
const T3 = tourData(V3)
// What the owner sent on each version, in the order sent.
const sentOn = (version: number) =>
  ANSWERS.flatMap(a => (a.type === 'finding' && a.spec_version === version ? [{ id: a.id as string, choice: a.choice as string }] : []))
const TOUR_CASE = 'EX-3'

const STEPS = [
  {
    title: 'Welcome to Resolve',
    say: 'Resolve checks every case against your SOP and asks you when the SOP is unclear. The example is a Know Your Business (KYB) procedure: the checks a bank or payments company runs on a business before taking it on as a customer, such as who owns it, sanctions and risky industries. This is one real run on six example businesses. It takes two minutes and changes nothing.',
  },
  {
    title: 'Your SOP, as rules',
    say: 'Claude turned each section of your SOP into a rule. You never have to read the rules.',
  },
  {
    title: 'Where your SOP is unclear',
    say: 'A solver checked the rules against every possible case and found three places where the SOP can\'t mean what it says.',
  },
  {
    title: 'Answer two of them',
    say: 'Each answer shows what it would change before you pick it. Pick the highlighted answers, then send them.',
  },
  {
    title: 'Version 2: what your answers changed',
    say: 'Your answers became version 2. This is what it changes.',
  },
  {
    title: 'Answer the follow-up, then approve',
    say: 'One follow-up question, then you approve.',
  },
  {
    title: 'Your cases under version 3',
    say: 'Your cases under the approved rules. Open Cedar Ridge.',
  },
  {
    title: 'A case record',
    say: 'Every outcome cites its SOP section and the facts behind it.',
  },
  {
    title: "That's the loop",
    say: 'SOP, questions, your answers, the next version, all checked before you approve.',
  },
] as const
const CASES_STEP = 6

async function startTour($: EngineInterface) {
  await goTo($, 0)
}

async function goTo($: EngineInterface, step: number | null) {
  await update($, tourPick, () => ({}))
  await update($, openCase, () => (step === CASES_STEP + 1 ? TOUR_CASE : null))
  await update($, tour, () => step)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'resolve', description: 'Open the Claude Resolve pane' })
    // Apps that can't run slash commands (the Claude app) open it through this tool.
    await $.tool.register({
      name: 'open_pane',
      description: 'Open the Resolve pane beside the chat.',
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    await load($)
    $.clock.every(2000, () => load($))
    // The first time the mod starts for this person, the pane opens on the tour.
    try {
      if (!(await $.store.get('tour_seen'))) {
        await $.store.set('tour_seen', true)
        await startTour($)
      }
    } catch {
      // Without its store the mod can't tell a first start; the Tour button still opens it.
    }
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('tool.call', { tool: 'mcp__resolve__open_pane' }, async $ => {
    await load($)
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })

    return { result: isPlaced ? 'The Resolve pane is open.' : 'The pane was opened, but this surface is not showing it.' }
  })

  on('command.run', { command: 'resolve' }, async ($, e) => {
    await load($)
    if (e.args.trim() === 'tour') await startTour($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: e.args.trim() === 'tour' ? 'The Resolve tour is open beside the chat.' : 'Claude Resolve is open beside the chat.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // The terminal has no Svg: it draws the status marks as glyphs, a desktop as small drawn icons.
    const Svg = 'Svg' in els ? (els as { Svg: (p: { source: string; alt: string; width?: number; height?: number }) => JSX.Element }).Svg : null
    const terminal = e.surface === 'terminal'
    const d = await read($, data)
    const current = await read($, tab)
    const shownNow = await read($, shown)
    const width = Math.max(30, (e.props.bodyColumns as number | undefined) ?? 60)

    if (!d) return <Text dimColor>Loading…</Text>

    const isShown = (k: string) => !!shownNow[k]
    const toggle = (k: string) => update($, shown, s => ({ ...s, [k]: !s[k] }))
    // An option row is a native button on a desktop; the terminal draws it plain, `1: option`, as a survey's row reads.
    const plainOnTerminal = terminal ? { plain: true as const } : {}

    const mark = (m: Mark, alt: string) =>
      Svg ? <Svg source={MARK[m].svg} alt={alt} width={14} height={14} /> : <Text color={MARK[m].color} dimColor={m === 'todo'}>{MARK[m].glyph}</Text>
    const caption = (t: string) => <Text dimColor size="caption" weight="semibold">{t}</Text>

    // ---- What the stage strip says about each stage -------------------------
    const working = (stage: number) => d.status?.state === 'working' && d.status.stage === stage
    const spec = d.spec
    const items = spec ? rulesQueue(d, spec) : null
    const open = items ? items.filter(x => !x.answer) : []
    const unwritten = spec ? spec.findings.filter(f => !asked(f) && !findingAnswer(d, f)) : []
    const toSend = unsent(d)
    const rulesMark: [Mark, number | null] =
      !spec ? [working(1) ? 'working' : 'todo', null]
      : working(1) ? ['working', null]
      : approved(d) ? ['done', null]
      : ['needs', open.length + unwritten.length || null]
    const run = d.cases
    const toLook = run ? run.cases.filter(needsALook) : []
    const casesMark: [Mark, number | null] =
      !run ? [working(2) ? 'working' : 'todo', null] : working(2) ? ['working', null] : toLook.length ? ['needs', toLook.length] : ['done', null]
    const latest = d.rounds?.rounds.at(-1)
    const accepted = d.rounds
      ? Math.max(d.rounds.accepted_version ?? 0, ...d.answers.flatMap(a => (a.type === 'accept_skill' && sameSpec(a, d) ? [a.version] : [])))
      : 0
    const roundsMark: [Mark, number | null] =
      !latest ? [working(3) ? 'working' : 'todo', null]
      : working(3) ? ['working', null]
      : latest.got_worse.length ? ['worse', latest.got_worse.length]
      : accepted >= latest.skill_version ? ['done', null]
      : ['needs', null]
    const STAGES = [
      { tab: 'spec' as Tab, name: 'Rules', m: rulesMark },
      { tab: 'process' as Tab, name: 'Cases', m: casesMark },
      { tab: 'improve' as Tab, name: 'Rounds', m: roundsMark },
    ]
    const SAY: Record<Mark, string> = { needs: 'needs you', working: 'Claude working', done: 'done', todo: 'not started', worse: 'got worse' }

    const header = (
      <Box flexDirection="column" gap={1} marginBottom={1}>
        <Box flexDirection="row" justifyContent="space-between" gap={2}>
          <Text weight="semibold" size="heading" wrap="truncate-end">
            {spec?.sop_title ?? TITLE}
          </Text>
          <Box flexDirection="row" gap={1} flexShrink={0}>
            <Text dimColor size="footnote">
              {spec ? `spec v${spec.version}` : 'no spec yet'}
              {d.cases?.skill_version != null ? ` · skill v${d.cases.skill_version}` : ''}
              {d.source === 'sample' ? ' · sample data' : ''}
            </Text>
            <Button key="tour" {...plainOnTerminal} dimColor onPress={() => startTour($)}>
              Tour
            </Button>
          </Box>
        </Box>
        <Box flexDirection="row" gap={3}>
          {STAGES.map(s => (
            <Box key={`stage-${s.tab}`} flexDirection="row" gap={1} alignItems="center">
              {mark(s.m[0], `${s.name}, ${SAY[s.m[0]]}`)}
              <Button key={`tab-${s.tab}`} plain dimColor={current !== s.tab} onPress={() => update($, tab, () => s.tab)}>
                <Text weight={current === s.tab ? 'bold' : 'regular'}>{s.name}</Text>
                {s.m[1] ? <Text color={s.m[0] === 'worse' ? 'error' : 'warning'}> {s.m[1]}</Text> : ''}
              </Button>
            </Box>
          ))}
        </Box>
        {d.status &&
          (d.status.state === 'working' ? (
            <Box flexDirection="column">
              <Text>
                <Text color="claude">✻</Text> {d.status.activity}
                {d.status.progress ? <Text dimColor tabular>  {d.status.progress[0]} / {d.status.progress[1]}</Text> : ''}
              </Text>
              {d.status.progress && <Text color="claude">{bar(d.status.progress[0] / Math.max(1, d.status.progress[1]), Math.min(40, width - 4))}</Text>}
            </Box>
          ) : (
            <Text color={d.status.state === 'failed' ? 'error' : undefined} dimColor={d.status.state !== 'failed'} size="footnote">
              {d.status.activity}
            </Text>
          ))}
      </Box>
    )

    // A past case the spec decides differently. Without a settled team decision, it compares with the previous version.
    const pastLine = (p: PastCase, version: number) => {
      const was = p.past_decision ?? p.previous_spec_decision ?? null
      return (
        <Text>
          {p.past_decision ? 'Your team: ' : `Spec v${version - 1}: `}
          <Text color={label(was).color}>{label(was).label}</Text>
          {'   '}
          {p.past_decision ? 'Spec' : `Spec v${version}`}: <Text color={label(p.spec_decision).color}>{label(p.spec_decision).label}</Text>
        </Text>
      )
    }

    // Each SOP paragraph with the rules written from it, in the rules' own plain sentences.
    const sopRules = (spec: Spec) =>
      spec.sop.map(s => (
        <Box key={`sop-${s.ref}`} flexDirection="column">
          <Text>
            <Text weight="bold">{s.ref}</Text> <Text dimColor>{s.text}</Text>
          </Text>
          {s.rules.length > 0 ? (
            s.rules.flatMap(id => {
              const r = spec.rules.find(x => x.id === id)
              return r ? [<Text>  → {r.says}</Text>] : []
            })
          ) : s.covered === false || s.covered === undefined ? (
            <Text color="warning">  no rule</Text>
          ) : (
            <Text dimColor>  covered by the spec itself</Text>
          )}
        </Box>
      ))

    // ---- Rules: one queue of questions for the expert ---------------------------
    const rulesView = async () => {
      if (!spec || !items) return <Text dimColor>No spec yet. Ask Claude to turn your SOP into a spec.</Text>
      const sopOpen = await read($, showSop)
      const focused = await read($, focus)
      // A paragraph the spec covers without a rule of its own (the outcome order, the unknowns rule) is covered.
      const uncovered = spec.sop.filter(s => s.covered === false || (s.covered === undefined && s.rules.length === 0))
      const covered = spec.sop.length - uncovered.length
      const seen = seenOf(d)
      // Pressing an answer moves NEXT on to the top of what's left.
      const answer = (line: Answer) => append($, [line], seen).then(() => update($, focus, () => null))
      const next = items.find(x => x.id === focused) ?? open[0] ?? null
      const upNext = open.filter(x => x !== next)
      const done = items.filter(x => x.answer && x !== next)

      // The prompt names every answer in the batch, in the expert's words, and the command that applies it.
      const sendPrompt = (cur: RunData) => {
        const toSend = unsent(cur)
        const lines = toSend.map(a => {
          const f = spec.findings.find(x => x.id === a.id)
          const p = spec.past_cases.find(x => x.case_id === a.id)
          return f ? `- "${f.question}": ${a.choice}` : p ? `- ${p.name}: ${a.choice === 'past_right' ? 'the earlier decision was right' : 'the spec is right'}` : `- ${a.id}: ${a.choice}`
        })
        const head = `I answered ${toSend.length} ${toSend.length === 1 ? 'question' : 'questions'} on spec v${spec.version} in the Resolve pane:\n${lines.join('\n')}\n`
        // Verdicts on past cases don't change the rules yet, so a batch of only those has nothing for next-spec to apply.
        return toSend.some(a => a.key.startsWith('f:'))
          ? head + 'Run `pnpm next-spec` to write the next spec version from them, then tell me what changed.'
          : head + "These are verdicts on past cases, which don't change the rules yet, so there's nothing to run."
      }

      // Under each option: what it changes, in the words pnpm resolve worked out before the expert answers.
      // What matters most comes first: a new problem, then the past cases that change, then how many kinds of case.
      const consequences = (f: Finding, opt: string) => {
        const says = f.option_edits?.find(o => o.option === opt)?.says
        const i = f.impact?.find(x => x.option === opt)
        const n = i?.changes.length ?? 0
        const first = i?.changes[0]
        return (
          <Box flexDirection="column" paddingLeft={3}>
            {says && <Text dimColor>{says}</Text>}
            {!i ? (
              f.option_edits && <Text dimColor size="footnote">What this changes hasn't been worked out yet.</Text>
            ) : i.problems.length > 0 ? (
              <Text color="error">Can't be applied: {i.problems.join(' ')}</Text>
            ) : i.keeps_rules ? (
              <Text dimColor size="footnote">Keeps the rules as they are.</Text>
            ) : (
              <Box flexDirection="column">
                {i.new_findings.map(x => (
                  <Text color="warning">New problem it would cause: {x.title}</Text>
                ))}
                {!i.resolves && <Text color="warning">Z3 would still report this problem.</Text>}
                {i.flips.length > 0 && (
                  <Text>
                    Past cases that change:{' '}
                    {i.flips.map((x, k) => (
                      <Text>
                        {k ? ', ' : ''}
                        {x.name} (<Text color={label(x.from).color}>{label(x.from).label.toLowerCase()}</Text> → <Text color={label(x.to).color}>{label(x.to).label.toLowerCase()}</Text>)
                      </Text>
                    ))}
                  </Text>
                )}
                <Text dimColor size="footnote">
                  {n === 0
                    ? i.searched_items_per_list ? `No case with up to ${i.searched_items_per_list} items in each list decides differently.` : 'No case decides differently.'
                    : `${n} ${n === 1 ? 'kind of case decides' : 'kinds of case decide'} differently, e.g. ${label(first!.from).label.toLowerCase()} → ${label(first!.to).label.toLowerCase()}`}
                </Text>
                {n > 0 && isShown(`why:${f.id}`) && <Text dimColor size="footnote">{first!.example}</Text>}
              </Box>
            )}
            {i && i.matches_past !== null && <Text dimColor size="footnote">Agrees with {i.matches_past} of {i.past_decided} past team decisions.</Text>}
          </Box>
        )
      }

      const askClaude = (key: string, about: string) => (
        <Button key={`ask-${key}`} {...plainOnTerminal} dimColor onPress={() => fill($, about)}>
          Ask Claude ▸
        </Button>
      )
      const answerState = (g: Given | null, said: string) =>
        !g ? null
        : g.sent ? <Text color="success">Sent: {said}</Text>
        : <Text color="warning">Your answer: {said} · not sent yet</Text>

      const findingCard = (f: Finding, g: Given | null) => (
        <Box key={`next-${f.id}`} flexDirection="column" gap={1} borderStyle="round" borderColor="warning" paddingX={1}>
          <Box flexDirection="row" justifyContent="space-between" gap={2}>
            <Text dimColor size="caption">
              {KIND[f.kind]} · SOP {f.sop_refs.join(', ')}
              {f.severity === 'high' ? ' · can change a decline or an approve' : ''}
            </Text>
            {askClaude(f.id, `About this question in the Resolve pane: "${f.question}"\n${f.explain}\nWhich option would you pick, and why? Don't answer it for me.`)}
          </Box>
          <Text weight="bold" size="heading">{f.question}</Text>
          {answerState(g, g?.choice ?? '')}
          <Box flexDirection="column" gap={1}>
            {f.options.map((opt, k) => {
              const blocked = (f.impact?.find(x => x.option === opt)?.problems.length ?? 0) > 0
              const picked = g?.choice === opt
              return (
                <Box key={`opt-${f.id}-${k}`} flexDirection="column">
                  {blocked ? (
                    <Text dimColor>{k + 1}: {opt}</Text>
                  ) : (
                    <Button
                      key={`f-${f.id}-${opt}`}
                      {...plainOnTerminal}
                      hotkey={k < 9 ? String(k + 1) : undefined}
                      variant={picked ? 'primary' : undefined}
                      onPress={() => answer({ type: 'finding', id: f.id, rule_ids: f.rule_ids ?? [], choice: opt, at: now() })}
                    >
                      {picked ? `${opt} ✓` : opt}
                    </Button>
                  )}
                  {consequences(f, opt)}
                </Box>
              )
            })}
          </Box>
          <Box flexDirection="row" gap={2}>
            <Button key={`why-${f.id}`} plain dimColor onPress={() => toggle(`why:${f.id}`)}>
              Why Claude is asking {isShown(`why:${f.id}`) ? '▾' : '▸'}
            </Button>
            {f.proof && (
              <Button key={`logic-${f.id}`} plain dimColor onPress={() => toggle(`logic:${f.id}`)}>
                Show the logic {isShown(`logic:${f.id}`) ? '▾' : '▸'}
              </Button>
            )}
          </Box>
          {isShown(`why:${f.id}`) && (
            <Box flexDirection="column">
              <Text weight="semibold">{f.title}</Text>
              <Text>{f.explain}</Text>
              {!!f.example && <Text dimColor>Example: {f.example}</Text>}
              {(f.example_facts ?? []).map(x => (
                <Text dimColor>
                  {'  '}
                  {x.name}
                  {x.item ? ` (${x.list === 'people' ? 'person' : 'item'} ${x.item})` : ''}: <Text color={x.value === 'unknown' ? 'warning' : undefined}>{x.value}</Text>
                </Text>
              ))}
              {f.ownership && ownershipView(f.ownership)}
            </Box>
          )}
          {f.proof && isShown(`logic:${f.id}`) && (
            <Box flexDirection="column">
              <Text dimColor>Z3 was asked: {f.proof.asks}</Text>
              <Text mono>{f.proof.code}</Text>
              <Text dimColor>
                Answer: {f.proof.answer === 'unknown' ? 'not decided' : f.proof.answer === 'unsat' ? 'no such case (unsat)' : 'a case exists (sat)'} · {f.proof.ms} ms
                {f.rule_ids?.length ? ` · rules ${f.rule_ids.join(', ')}` : ''}
              </Text>
            </Box>
          )}
        </Box>
      )

      const pastCard = (p: PastCase, g: Given | null) => {
        const earlier = p.past_decision ? 'Team was right' : 'Earlier version was right'
        return (
          <Box key={`next-${p.case_id}`} flexDirection="column" gap={1} borderStyle="round" borderColor="warning" paddingX={1}>
            <Box flexDirection="row" justifyContent="space-between" gap={2}>
              <Text dimColor size="caption">
                Past case {p.case_id} · {p.past_decision ? 'your team decided it differently' : `changes in spec v${spec.version}`}
              </Text>
              {askClaude(p.case_id, `About ${p.name} (${p.case_id}) in the Resolve pane: ${p.why}\nWhich decision is right under the SOP, and why? Don't answer it for me.`)}
            </Box>
            <Text weight="bold" size="heading">{p.name}: which decision is right?</Text>
            {pastLine(p, spec.version)}
            <Text dimColor>{p.why}</Text>
            {answerState(g, g?.choice === 'past_right' ? earlier : 'Spec was right')}
            <Box flexDirection="column">
              {[
                { key: 'past', verdict: 'past_right' as const, say: earlier },
                { key: 'spec', verdict: 'spec_right' as const, say: 'Spec was right' },
              ].map((o, k) => (
                <Button
                  key={`p-${p.case_id}-${o.key}`}
                  {...plainOnTerminal}
                  hotkey={String(k + 1)}
                  variant={g?.choice === o.verdict ? 'primary' : undefined}
                  onPress={() => answer({ type: 'past_case', case_id: p.case_id, verdict: o.verdict, at: now() })}
                >
                  {g?.choice === o.verdict ? `${o.say} ✓` : o.say}
                </Button>
              ))}
            </Box>
          </Box>
        )
      }

      const writeQuestions = (primary: boolean) => (
        <Button
          key="write-questions"
          {...(primary ? {} : plainOnTerminal)}
          variant={primary ? 'primary' : undefined}
          dimColor={!primary}
          onPress={() =>
            fill($, 'Run `pnpm write-options` to write a question and options for each finding in the Resolve pane that has none, then `pnpm resolve` to work out what each option changes.')
          }
        >
          Ask Claude to write them
        </Button>
      )

      const blockedBy =
        open.length > 0 ? `Answer the ${open.length} open ${open.length === 1 ? 'item' : 'items'} before approving spec v${spec.version}.`
        : unwritten.length > 0 ? `Spec v${spec.version} can be approved once Claude has written its questions and you've answered them.`
        : toSend.length > 0 ? `Send your answers before approving spec v${spec.version}.`
        : null

      // The card on top: the next question, Claude's questions still to write, or the approval.
      const nextCard =
        next ? (next.type === 'finding' ? findingCard(next.f, next.answer) : pastCard(next.p, next.answer))
        : unwritten.length > 0 ? (
          <Box flexDirection="column" gap={1} borderStyle="round" borderColor="warning" paddingX={1}>
            <Text dimColor size="caption">Z3 found {unwritten.length} {unwritten.length === 1 ? 'problem' : 'problems'} in the rules</Text>
            <Text weight="bold" size="heading">No question written yet</Text>
            <Box flexDirection="column">
              {unwritten.map(f => (
                <Text key={`uw-${f.id}`}>
                  • {f.title} <Text dimColor>· SOP {f.sop_refs.join(', ')}</Text>
                </Text>
              ))}
            </Box>
            <Text dimColor>Claude writes one question for each, with options and what each option would change.</Text>
            {writeQuestions(true)}
          </Box>
        )
        : toSend.length > 0 ? null
        : approved(d) ? (
          <Box flexDirection="column" borderStyle="round" borderColor="success" paddingX={1}>
            <Text color="success" weight="bold">✓ Spec v{spec.version} approved</Text>
            <Text dimColor>Cases are decided under these rules.</Text>
          </Box>
        )
        : approvalSent(d) ? (
          <Box flexDirection="column" borderStyle="round" borderColor="success" paddingX={1}>
            <Text color="success">Approval of spec v{spec.version} sent. Claude records it with pnpm resolve.</Text>
          </Box>
        ) : (
          <Box flexDirection="column" gap={1} borderStyle="round" borderColor="warning" paddingX={1}>
            <Text weight="bold" size="heading">Spec v{spec.version} has no open questions</Text>
            <Text dimColor>Approve it to decide cases under these rules.</Text>
            <Button
              key="approve-spec"
              variant="primary"
              onPress={() =>
                append($, [{ type: 'approve_spec', version: spec.version, at: now() }], seen,
                  `I approve spec v${spec.version} in the Resolve pane. Run \`pnpm resolve\` to record the approval.`)
              }
            >
              Approve spec v{spec.version}
            </Button>
          </Box>
        )

      const changes = spec.changes_from_previous ?? []
      const flipped = spec.past_cases
      const doneSay = (x: QueueItem) =>
        x.type === 'finding' ? x.answer!.choice : x.answer!.choice === 'past_right' ? (x.p.past_decision ? 'Team was right' : 'Earlier version was right') : 'Spec was right'
      const appliedIn = (id: string) => spec.applied?.find(a => a.id === id)?.applied_in

      return (
        <Box flexDirection="column" gap={1}>
          {nextCard && (
            <Box flexDirection="column">
              <Box flexDirection="row" justifyContent="space-between" gap={2}>
                {caption('Next')}
                {blockedBy && <Text dimColor size="footnote">{blockedBy}</Text>}
              </Box>
              {nextCard}
            </Box>
          )}

          {toSend.length > 0 && (
            <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} borderStyle="round" borderColor="warning" paddingX={1}>
              <Text color="warning" weight="semibold">
                {toSend.length} {toSend.length === 1 ? 'answer' : 'answers'} ready
              </Text>
              <Button
                key="send"
                variant="primary"
                onPress={() => append($, fresh => [{ type: 'send', ids: unsent(fresh).map(a => a.id), at: now() }], seen, sendPrompt)}
              >
                Send to Claude
              </Button>
            </Box>
          )}

          {(upNext.length > 0 || (next && unwritten.length > 0)) && (
            <Box flexDirection="column">
              {caption(`Up next  ${upNext.length + (next && unwritten.length ? 1 : 0)}`)}
              {upNext.map(x => (
                <Button key={`q-${x.id}`} plain onPress={() => update($, focus, () => x.id)}>
                  ▸ {short(x.type === 'finding' ? x.f.question ?? x.f.title : `${x.p.name}: which decision is right?`, Math.max(30, width - 4))}
                  {x.type === 'finding' && x.flips > 0 ? <Text dimColor>  {x.flips} {x.flips === 1 ? 'case' : 'cases'}</Text> : ''}
                </Button>
              ))}
              {next && unwritten.length > 0 && (
                <Box flexDirection="row" gap={1}>
                  <Text dimColor>
                    ▸ {unwritten.length} {unwritten.length === 1 ? 'problem' : 'problems'} with no question written yet
                  </Text>
                  {writeQuestions(false)}
                </Box>
              )}
            </Box>
          )}

          {spec.version > 1 && (changes.length > 0 || flipped.length > 0) && (
            <Box flexDirection="column">
              {caption('What your answers changed')}
              <Box flexDirection="column" gap={1} borderStyle="round" borderColor="subtle" paddingX={1}>
                <Box flexDirection="column">
                  <Text weight="bold">
                    Spec v{spec.version}: {changes.length} {changes.length === 1 ? 'kind of case changes' : 'kinds of case change'}
                    {flipped.length ? `, ${flipped.length} past ${flipped.length === 1 ? 'case' : 'cases'}` : ''}
                  </Text>
                  <Text dimColor size="footnote">Compared with spec v{spec.version - 1}.</Text>
                </Box>
                {changes.map((ch, k) => (
                  <Box key={`ch-${k}`} flexDirection="column">
                    <Text>
                      <Text color={label(ch.from).color}>{label(ch.from).label}</Text> → <Text color={label(ch.to).color} weight="semibold">{label(ch.to).label}</Text>
                    </Text>
                    <Text dimColor size="footnote">{isShown('changes') ? ch.example : short(ch.example, Math.max(40, width * 2))}</Text>
                  </Box>
                ))}
                {flipped.length > 0 && (
                  <Text dimColor>
                    Past cases: {flipped.map(p => `${p.name} (${label(p.previous_spec_decision ?? p.past_decision).label} → ${label(p.spec_decision).label})`).join(', ')}
                  </Text>
                )}
                {changes.some(ch => ch.example.length > Math.max(40, width * 2)) && (
                  <Button key="toggle-changes" plain dimColor onPress={() => toggle('changes')}>
                    {isShown('changes') ? 'Shorter examples' : 'Full examples'}
                  </Button>
                )}
              </Box>
            </Box>
          )}

          {done.length > 0 && (
            <Box flexDirection="column">
              {caption(`Done  ${done.length}`)}
              {done.map(x => {
                const at = x.type === 'finding' && x.f.answer && x.answer!.sent ? appliedIn(x.id) : undefined
                return (
                  <Box key={`done-${x.id}`} flexDirection="column">
                    <Button key={`q-${x.id}`} plain dimColor onPress={() => update($, focus, () => x.id)}>
                      {short(x.type === 'finding' ? x.f.question ?? x.f.title : x.p.name, Math.max(30, width - 6))}
                    </Button>
                    <Box paddingLeft={2}>
                      {x.type === 'finding' && x.f.answer && x.answer!.sent ? (
                        <Text color="success">Answered: {doneSay(x)}{at ? ` · applied in v${at}` : ''}</Text>
                      ) : (
                        answerState(x.answer, doneSay(x))
                      )}
                    </Box>
                  </Box>
                )
              })}
              {done.some(x => x.answer!.sent && !(x.type === 'finding' && x.f.answer)) && (
                <Text dimColor size="footnote">A sent answer can still change until Claude writes the next version: press it, pick again and send.</Text>
              )}
            </Box>
          )}

          <Box flexDirection="column" paddingTop={1}>
            <Button key="toggle-sop" plain dimColor onPress={() => update($, showSop, v => !v)}>
              Spec: {covered} of {spec.sop.length} SOP sections covered {sopOpen ? '▾' : '▸'}
            </Button>
            <Text dimColor size="footnote">
              {uncovered.length > 0 && <Text color="warning">Not covered: {uncovered.map(s => s.ref).join(', ')}. </Text>}
              {spec.rules.length} rules, checked by Z3 for every possible case.
            </Text>
            {sopOpen && sopRules(spec)}
          </Box>
        </Box>
      )
    }

    // ---- Cases: the skill run on cases, sorted by what needs a person ------------
    const casesView = async () => {
      if (!run) return <Text dimColor>No cases run yet. Ask Claude to write the processing skill and run it.</Text>
      const opened = await read($, openCase)
      const c = run.cases.find(x => x.id === opened)
      if (c) return caseDetail(c)
      const counts = [...new Set([...Object.keys(OUTCOME), ...run.cases.map(x => x.outcome as string)])].map(o => [o, run.cases.filter(x => x.outcome === o).length] as const)
      const counted = run.cases.filter(x => typeof x.tool_calls === 'number')
      const calls = counted.reduce((n, x) => n + (x.tool_calls as number), 0)
      const serious = run.cases.filter(x => !needsALook(x) && (x.outcome === 'escalate' || x.outcome === 'decline'))
      const clean = run.cases.filter(x => !needsALook(x) && !serious.includes(x))
      // One line per case: the outcome, the name, and the first thing a person should look at.
      const row = (x: CaseFile) => {
        const why =
          x.check?.outcome_follows === false ? `the rules give ${label(x.check.spec_outcome).label.toLowerCase()}`
          : x.check && x.check.outcome_follows === undefined && !x.check.passed ? 'the check failed'
          : x.missing.length ? `missing ${x.missing.length}`
          : x.check && (x.check.problems.length > 0 || (x.check.flags ?? []).length > 0) ? 'to check'
          : ''
        return (
          <Button key={`case-${x.id}`} plain onPress={() => update($, openCase, () => x.id)}>
            <Text color={label(x.outcome).color}>{label(x.outcome).label.padEnd(18)}</Text>
            {x.name}
            {why ? <Text color={x.check?.outcome_follows === false ? 'error' : 'warning'}>  {why}</Text> : ''}
          </Button>
        )
      }
      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text>
              {run.cases.length} cases
              {run.skill_version != null ? ` with skill v${run.skill_version}` : ''}
              {counted.length ? ` · ${calls} tool calls` : ''}
            </Text>
            <Text>
              {counts
                .filter(([, n]) => n > 0)
                .map(([o, n]) => (
                  <Text color={label(o).color}>
                    {label(o).label} {n}
                    {'   '}
                  </Text>
                ))}
            </Text>
          </Box>
          {toLook.length > 0 && (
            <Box flexDirection="column">
              <Box flexDirection="row" gap={1} alignItems="center">
                {mark('needs', 'needs you')}
                {caption(`Needs a look  ${toLook.length}`)}
              </Box>
              {toLook.map(row)}
            </Box>
          )}
          {serious.length > 0 && (
            <Box flexDirection="column">
              {caption(`Escalated or declined  ${serious.length}`)}
              {serious.map(row)}
            </Box>
          )}
          {clean.length > 0 && (
            <Box flexDirection="column">
              <Button key="toggle-clean" plain dimColor onPress={() => toggle('clean')}>
                {`Clean  ${clean.length} ${isShown('clean') ? '▾' : '▸'}`}
              </Button>
              {isShown('clean') && clean.map(row)}
            </Box>
          )}
          <Button key="run-cases" {...plainOnTerminal} dimColor onPress={() => fill($, `Run the kyb-review skill on every case and write the results to ${DIR}/cases.json.`)}>
            Run all cases again
          </Button>
        </Box>
      )
    }

    // A company's owners are walked down to people. null: nobody has found them; absent: none are needed.
    const holderRows = (hs: Holder[], depth: number): JSX.Element[] =>
      hs.flatMap(holder => {
        // A pool nobody named is the share no one accounts for; any other pool (a trust, an option pool) says what it is by its name.
        const unnamed = holder.type === 'pool' && holder.name === 'Unidentified holders'
        const warn = (holder.type === 'entity' && holder.owners === null) || unnamed
        const note =
          holder.type === 'entity'
            ? holder.owners === null ? '  company, owners unknown' : holder.owners ? '  company' : '  company, no owners needed'
            : holder.type === 'pool'
              ? unnamed ? '  not identified' : ''
              : `  ID check: ${holder.verified ? 'yes' : 'no'}`
        return [
          <Text>
            {'  '.repeat(depth + 1)}
            {String(holder.pct).padStart(3)}% {holder.name}
            <Text color={warn ? 'warning' : undefined} dimColor={!warn}>
              {note}
            </Text>
            <Text dimColor> · {holder.source}</Text>
          </Text>,
          ...(holder.owners ? holderRows(holder.owners, depth + 1) : []),
        ]
      })

    const ownershipView = (o: Ownership) => (
      <Box flexDirection="column">
        <Text weight="bold">Ownership</Text>
        {holderRows(o.holders, 0)}
        {o.unaccounted_pct === null ? (
          <Text color="warning">  A share couldn't be read, so what's unaccounted for isn't known.</Text>
        ) : (
          o.unaccounted_pct > 0 && <Text color="warning">  {String(o.unaccounted_pct).padStart(3)}% unaccounted for</Text>
        )}
      </Box>
    )

    const caseDetail = (c: CaseFile, back: () => unknown = () => update($, openCase, () => null)) => (
      <Box flexDirection="column" gap={1}>
        <Button key="back" plain dimColor onPress={back}>
          ← All cases
        </Button>
        <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
          <Text>
            <Text weight="bold" size="heading">{c.name}</Text>
            <Text dimColor> {c.id}</Text>
          </Text>
          <Text>
            <Text color={label(c.outcome).color} weight="bold">
              {label(c.outcome).label}
            </Text>
            <Text dimColor> because {c.decided_by}</Text>
          </Text>
          {(c.notes ?? []).map(n => (
            <Text dimColor>  {n}</Text>
          ))}
        </Box>
        {c.check && (
          <Box flexDirection="column">
            {c.check.outcome_follows === undefined && !c.check.passed && <Text color="error">The check on this case file failed.</Text>}
            {c.check.outcome_follows !== undefined && (
              <Text color={c.check.outcome_follows ? 'success' : 'error'}>
                {c.check.outcome_follows
                  ? 'The rules give this outcome on the facts in the file.'
                  : `The rules give ${c.check.spec_outcome ? label(c.check.spec_outcome).label.toLowerCase() : 'a different outcome'} on the facts in the file.`}
                {c.check.expected && <Text dimColor> · known answer: {label(c.check.expected).label}</Text>}
              </Text>
            )}
            {(c.check.problems.length > 0 || (c.check.flags ?? []).length > 0) && (
              <Box flexDirection="column">
                <Text color="warning">For a person to check</Text>
                {[...c.check.problems, ...(c.check.flags ?? [])].map(p => (
                  <Text>  • {p}</Text>
                ))}
                {c.check.outcome_follows !== undefined && (
                  <Text dimColor size="footnote">  From the example evidence checks. Resolve takes the facts as given; it doesn't verify the evidence.</Text>
                )}
              </Box>
            )}
          </Box>
        )}
        {c.missing.length > 0 && (
          <Box flexDirection="column">
            <Text color="warning">Still missing</Text>
            {c.missing.map(m => (
              <Text>  • {m}</Text>
            ))}
          </Box>
        )}
        {c.ownership && ownershipView(c.ownership)}
        <Box flexDirection="column">
          {caption('Case file')}
          {c.facts.map(f => (
            <Box flexDirection="column">
              <Text>
                {f.name}: <Text color={f.value === 'unknown' ? 'warning' : undefined} weight="semibold">{f.value}</Text>
              </Text>
              <Text dimColor size="footnote">
                {'  '}
                {f.source}
                {f.how === 'judgment' ? (f.by ? ` · a judgment call, by ${f.by}` : ' · a judgment call') : ''}
              </Text>
              {f.problem && <Text color="warning">  {f.problem}</Text>}
            </Box>
          ))}
        </Box>
        {typeof c.tool_calls === 'number' && <Text dimColor size="footnote">{c.tool_calls} tool calls</Text>}
      </Box>
    )

    // ---- Rounds: verify the processing, loop ---------------------------------
    const roundsView = () => {
      const r = d.rounds
      if (!r || r.rounds.length === 0) return <Text dimColor>No checks run yet. Ask Claude to check every case file against the spec.</Text>
      const latest = r.rounds.at(-1) as Round
      const before = r.rounds.at(-2)
      const w = Math.min(30, width - 22)
      const gain = before && latest.correct !== undefined && before.correct !== undefined ? latest.correct - before.correct : null
      const [top, ...rest] = latest.groups

      return (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text weight="bold" size="heading">
              Round {latest.n}
              {latest.correct !== undefined ? ` · ${latest.correct} of ${latest.total} correct` : ''}
              {gain ? <Text color={gain > 0 ? 'success' : 'error'}> ({gain > 0 ? '▲' : '▼'} {Math.abs(gain)})</Text> : ''}
              {` · ${latest.passed} consistent`}
            </Text>
            <Text dimColor size="footnote">
              Correct: the outcome matches the known answer. Consistent: the case file's outcome follows from its facts under the spec. Claude may change the skill, never the spec or these checks.
            </Text>
          </Box>
          {latest.got_worse.length > 0 && <Text color="error">Got worse this round: {latest.got_worse.join(', ')}</Text>}
          {top && caption('Still failing, grouped by cause')}
          {top && (
            <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
              <Text dimColor size="caption">Biggest failure group · {top.cases.length} cases</Text>
              <Text weight="bold">{top.cause}</Text>
              <Text dimColor>Change: {top.change}</Text>
              <Button
                key="next-round"
                {...plainOnTerminal}
                onPress={() =>
                  fill($, `Run another improvement round: change the kyb-review skill to fix the biggest failure group, re-run every case, and write ${DIR}/rounds.json. Don't edit the spec or the checker.`)
                }
              >
                Run another round
              </Button>
            </Box>
          )}
          {rest.length > 0 && (
            <Box flexDirection="column">
              {rest.map(g => (
                <Text key={`g-${g.cause}`}>
                  {g.cause} <Text dimColor>({g.cases.length} cases)</Text>
                </Text>
              ))}
            </Box>
          )}
          {latest.back_to_spec.length > 0 && (
            <Box flexDirection="column">
              {caption('Needs the expert, not the skill')}
              {latest.back_to_spec.map(s => (
                <Text color="warning">  • {s}</Text>
              ))}
            </Box>
          )}
          <Box flexDirection="column">
            {caption('Every round')}
            {r.rounds.map(x => (
              <Box flexDirection="column">
                <Text>
                  Round {x.n} <Text dimColor>skill v{x.skill_version}</Text>
                  {x.got_worse.length > 0 && <Text color="error">  {x.got_worse.length} got worse</Text>}
                </Text>
                {x.correct !== undefined && (
                  <Text>
                    {'  correct     '}
                    <Text color="success">{bar(x.correct / x.total, w)}</Text> {x.correct}/{x.total}
                  </Text>
                )}
                <Text>
                  {'  consistent  '}
                  <Text dimColor>{bar(x.passed / x.total, w)}</Text> {x.passed}/{x.total}
                </Text>
              </Box>
            ))}
          </Box>
          {accepted >= latest.skill_version ? (
            <Text color="success">Skill v{latest.skill_version} accepted</Text>
          ) : latest.got_worse.length > 0 ? (
            <Text dimColor>Skill v{latest.skill_version} can be accepted once nothing got worse.</Text>
          ) : (
            <Button
              key="accept-skill"
              variant="primary"
              onPress={() =>
                append($, [{ type: 'accept_skill', version: latest.skill_version, at: now() }], seenOf(d),
                  `I accept skill v${latest.skill_version}. Save it as the current version of the kyb-review skill.`)
              }
            >
              Accept skill v{latest.skill_version}
            </Button>
          )}
        </Box>
      )
    }

    // A case record, short: the outcome, why, and what to do. The facts are one press away.
    const tourRecord = (c: CaseFile, showFacts: boolean) => {
      const follows = c.check?.outcome_follows !== false
      const now = c.check?.spec_outcome
      return (
        <Box flexDirection="column" gap={1}>
          <Button key="back" plain dimColor onPress={() => goTo($, CASES_STEP)}>
            ← All cases
          </Button>
          <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
            <Text>
              <Text weight="bold">{c.name}</Text>
              <Text dimColor>  {c.id}</Text>
            </Text>
            <Text>
              File says <Text color={label(c.outcome).color} weight="bold">{label(c.outcome).label}</Text>
              {!follows && now && (
                <Text>
                  {'  ·  '}rules give <Text color={label(now).color} weight="bold">{label(now).label}</Text>
                </Text>
              )}
            </Text>
            <Text dimColor>Because {c.decided_by.replace(/^The file says \w+, but the spec gives \w+\. /, '')}</Text>
            {c.missing.map(m => (
              <Text color="warning">Ask the customer: {m}</Text>
            ))}
            {c.ownership && (
              <Text dimColor>
                Owners: {c.ownership.holders.map(h => `${h.name} ${h.pct}%`).join(', ')}
                {c.ownership.unaccounted_pct ? ` · ${c.ownership.unaccounted_pct}% unaccounted for` : ''}
              </Text>
            )}
          </Box>
          <Button key={`facts-${c.id}`} plain dimColor onPress={() => update($, tourPick, p => ({ ...p, facts: p.facts ? '' : 'yes' }))}>
            {showFacts ? 'Hide the facts' : `${c.facts.length} facts on file, each with its source`}
          </Button>
          {showFacts && (
            <Box flexDirection="column">
              {c.facts.map(f => (
                <Text>
                  {'  '}
                  {f.name}: <Text weight="semibold">{f.value}</Text>
                  <Text dimColor>  {f.source}</Text>
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    // ---- The tour: one recorded run, step by step ------------------------------
    const tourView = async (step: number) => {
      const picks = await read($, tourPick)
      const pick = (id: string, choice: string) => update($, tourPick, p => ({ ...p, [id]: choice }))
      const at = STEPS[step] ?? STEPS[0]
      const last = step === STEPS.length - 1
      const spec1 = T1.spec as Spec
      const spec2 = T2.spec as Spec
      const spec3 = T3.spec as Spec
      const find = (sp: Spec, id: string) => sp.findings.find(f => f.id === id) as Finding

      const toggle = (key: string) => update($, tourPick, p => ({ ...p, [key]: p[key] ? '' : 'yes' }))
      // One line on what an option does to your cases.
      const effect = (f: Finding, opt: string) => {
        const i = f.impact?.find(x => x.option === opt)
        if (!i) return null
        if (i.keeps_rules) return <Text dimColor>  Nothing changes.</Text>
        const fresh = (i.new_findings ?? []).length
        return (
          <Text>
            {'  '}
            {i.flips.length === 0 ? <Text dimColor>None of your cases changes</Text> : i.flips.map((x, k) => (
              <Text>
                {k ? ', ' : ''}
                {short(x.name ?? x.case_id, 28)}: <Text color={label(x.from).color}>{label(x.from).label}</Text> → <Text color={label(x.to).color}>{label(x.to).label}</Text>
              </Text>
            ))}
            {fresh > 0 && <Text dimColor> · raises a new question</Text>}
          </Text>
        )
      }
      // A question as the owner sees it: the question, the options and what each changes. Why it's a question is one press away.
      const tourCard = (f: Finding, sent?: string) => {
        const chosen = sent && picks[f.id] === sent ? sent : null
        return (
          <Box key={`tc-${f.id}`} flexDirection="column" borderStyle="round" borderColor={chosen ? 'success' : 'warning'} paddingX={1}>
            <Text dimColor>SOP {f.sop_refs.join(', ')}</Text>
            <Text weight="bold">{f.question}</Text>
            {picks[`why-${f.id}`] ? <Text dimColor>{f.explain}</Text> : null}
            <Button key={`why-${f.id}`} plain dimColor onPress={() => toggle(`why-${f.id}`)}>
              {picks[`why-${f.id}`] ? 'Hide why' : 'Why is this a question?'}
            </Button>
            {sent &&
              (chosen ? (
                <Box flexDirection="column">
                  <Text color="success">✓ {chosen}</Text>
                  {effect(f, chosen)}
                </Box>
              ) : (
                <Box flexDirection="column">
                  {f.options.map(opt => (
                    <Box key={`to-${f.id}-${opt}`} flexDirection="column">
                      <Button key={`f-${f.id}-${opt}`} variant={opt === sent ? 'primary' : undefined} onPress={() => pick(f.id, opt)}>
                        {opt}
                      </Button>
                      {effect(f, opt)}
                    </Box>
                  ))}
                  {picks[f.id] && picks[f.id] !== sent && <Text color="warning">A fine answer, but nothing would change. Pick the highlighted one to see a change.</Text>}
                </Box>
              ))}
          </Box>
        )
      }
      const flipped = (p: PastCase, version: number) => (
        <Text key={`tp-${p.case_id}`}>
          {'  '}
          {short(p.name, 28)}  {pastLine(p, version)}
        </Text>
      )

      let content: JSX.Element
      let ready = true   // whether Next is the thing to press now
      if (step === 0) {
        content = (
          <Box flexDirection="column">
            {STEPS.slice(1, -1).map((x, k) => (
              <Text dimColor>  {k + 1}. {x.title}</Text>
            ))}
          </Box>
        )
      } else if (step === 1) {
        content = (
          <Box flexDirection="column">
            <Text dimColor>{spec1.sop.length} sections · {spec1.rules.length} rules</Text>
            {spec1.sop.map(s => (
              <Text key={`ts-${s.ref}`}>
                <Text color={s.rules.length || s.covered ? 'success' : 'warning'}>{s.rules.length || s.covered ? '✓' : '○'}</Text> <Text weight="bold">{s.ref}</Text> {short(s.text, 52)}
                {!s.rules.length && !s.covered && <Text color="warning">  no rule yet</Text>}
              </Text>
            ))}
          </Box>
        )
      } else if (step === 2) {
        content = <Box flexDirection="column" gap={1}>{spec1.findings.map(f => tourCard(f))}</Box>
      } else if (step === 3) {
        const sent = sentOn(1)
        const done = sent.every(a => picks[a.id] === a.choice)
        const isSent = picks._sent === 'yes'
        ready = isSent
        content = (
          <Box flexDirection="column" gap={1}>
            {sent.map(a => tourCard(find(spec1, a.id), a.choice))}
            {isSent ? (
              <Text color="success">Sent. Version 2 is written and checked.</Text>
            ) : (
              <Button key="tour-send" variant={done ? 'primary' : undefined} onPress={() => (done ? pick('_sent', 'yes') : undefined)}>
                {done ? `Send ${sent.length} answers` : `Answer both to send (${sent.filter(a => picks[a.id] === a.choice).length} of ${sent.length})`}
              </Button>
            )}
            <Text dimColor>The third question is settled by the first, so the tour skips it.</Text>
          </Box>
        )
      } else if (step === 4) {
        content = (
          <Box flexDirection="column" gap={1}>
            <Box flexDirection="column">
              <Text weight="bold">Cases that change</Text>
              {spec2.past_cases.map(p => flipped(p, spec2.version))}
            </Box>
            <Box flexDirection="column">
              <Text weight="bold">New question</Text>
              {spec2.findings.map(f => (
                <Text>  {f.question}</Text>
              ))}
            </Box>
            <Text dimColor>Not live until you approve.</Text>
          </Box>
        )
      } else if (step === 5) {
        const [a] = sentOn(2)
        const f = a && find(spec2, a.id)
        const answered = !!a && picks[a.id] === a.choice
        const isApproved = picks._approved === 'yes'
        ready = isApproved
        content = (
          <Box flexDirection="column" gap={1}>
            {f && a && tourCard(f, a.choice)}
            {answered && (
              <Box flexDirection="column" borderStyle="round" borderColor={isApproved ? 'success' : 'subtle'} paddingX={1}>
                <Text>
                  <Text weight="bold">Version 3</Text>
                  <Text dimColor>
                    {'  '}
                    {spec3.findings.length === 0 ? 'no open questions' : `${spec3.findings.length} open questions`} ·{' '}
                    {spec3.past_cases.length === 0 ? 'no other case changes' : `${spec3.past_cases.length} more cases change`}
                  </Text>
                </Text>
                {isApproved ? (
                  <Text color="success">✓ Approved. Every case is now checked against it.</Text>
                ) : (
                  <Button key="tour-approve" variant="primary" onPress={() => pick('_approved', 'yes')}>
                    Approve version 3
                  </Button>
                )}
              </Box>
            )}
          </Box>
        )
      } else if (step === CASES_STEP) {
        const cases = T3.cases?.cases ?? []
        content = (
          <Box flexDirection="column">
            {cases.map(x => (
              <Button key={`case-${x.id}`} plain onPress={() => update($, openCase, () => x.id).then(() => update($, tour, () => CASES_STEP + 1))}>
                <Text color={label(x.outcome).color}>{label(x.outcome).label.padEnd(18)}</Text>
                {x.name}
                {x.check?.outcome_follows === false && <Text color="error">  needs a new decision</Text>}
              </Button>
            ))}
          </Box>
        )
      } else if (step === CASES_STEP + 1) {
        const opened = (await read($, openCase)) ?? TOUR_CASE
        const c = (T3.cases?.cases ?? []).find(x => x.id === opened) ?? (T3.cases?.cases ?? [])[0]
        content = c ? tourRecord(c, !!picks.facts) : <Text dimColor>No case.</Text>
      } else {
        content = (
          <Box flexDirection="column">
            <Text weight="bold">Try it on your own files</Text>
            <Text>  Run pnpm resolve in the repo, then answer the questions in this pane.</Text>
            <Text dimColor>  /resolve tour opens this tour again.</Text>
          </Box>
        )
      }

      return (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text weight="bold">{TITLE}</Text>
            <Text dimColor>
              {'  '}tour · {step + 1} of {STEPS.length}
            </Text>
          </Text>
          <Box flexDirection="column">
            <Text weight="bold">{at.title}</Text>
            <Text>{at.say}</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            {step > 0 && (
              <Button key="tour-back" onPress={() => goTo($, step - 1)}>
                Back
              </Button>
            )}
            {last ? (
              <Button key="tour-done" variant="primary" onPress={() => goTo($, null)}>
                Finish the tour
              </Button>
            ) : (
              <Button key="tour-next" variant={ready ? 'primary' : undefined} onPress={() => goTo($, step + 1)}>
                {step === 0 ? 'Start' : 'Next'}
              </Button>
            )}
            {last ? (
              <Button key="tour-again" onPress={() => goTo($, 0)}>
                Start again
              </Button>
            ) : (
              <Button key="tour-exit" dimColor onPress={() => goTo($, null)}>
                Skip the tour
              </Button>
            )}
          </Box>
          {content}
        </Box>
      )
    }

    const step = await read($, tour)
    if (step !== null) return await tourView(step)

    const body = current === 'spec' ? await rulesView() : current === 'process' ? await casesView() : roundsView()

    return (
      <Box flexDirection="column">
        {header}
        {body}
      </Box>
    )
  })
}
