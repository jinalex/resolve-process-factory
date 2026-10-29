import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { Answer, CaseFile, Finding, Holder, Outcome, Ownership, PastCase, Round, RunData, Status, Tab } from '../types'
import { SAMPLE } from './sample'

// The logic writes spec.json, cases.json, rounds.json and status.json here; the pane
// only appends to answers.jsonl. Contract: docs/INTERFACE.md at the repo root.
const DIR = '.resolve'
const PANE = 'resolve'
const TITLE = 'Claude Resolve'

const tab = atom({ plugin: 'resolve', key: 'tab' } as const, 'spec' as Tab)
const data = atom({ plugin: 'resolve', key: 'data' } as const, null, { shape: 'run-1' })
const openCase = atom({ plugin: 'resolve', key: 'openCase' } as const, null as string | null)
const showSop = atom({ plugin: 'resolve', key: 'showSop' } as const, false)

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

function append($: EngineInterface, lines: Answer[], seen: Seen, prompt?: string) {
  const run = async () => {
    const d = await read($, data)
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
    if (!sameSpec(a, d) || !asksStill(a)) continue
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

const label = (o: Outcome | null | undefined) => (o && OUTCOME[o] ? OUTCOME[o] : { label: 'no decision', color: 'subtle' })

function bar(fraction: number, width: number) {
  const filled = Math.round(fraction * width)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
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
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('tool.call', { tool: 'mcp__resolve__open_pane' }, async $ => {
    await load($)
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })

    return { result: isPlaced ? 'The Resolve pane is open.' : 'The pane was opened, but this surface is not showing it.' }
  })

  on('command.run', { command: 'resolve' }, async $ => {
    await load($)
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Claude Resolve is open beside the chat.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const d = await read($, data)
    const current = await read($, tab)
    const width = Math.max(30, (e.props.bodyColumns as number | undefined) ?? 60)

    if (!d) return <Text dimColor>Loading…</Text>

    const openQuestions = d.spec ? d.spec.findings.filter(f => !findingAnswer(d, f)).length + d.spec.past_cases.filter(p => !pastVerdict(d, p)).length : 0
    const last = d.rounds?.rounds.at(-1)

    const header = (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text weight="bold">{TITLE}</Text>
          <Text dimColor>
            {'  '}
            {d.spec ? `spec v${d.spec.version}` : 'no spec yet'}
            {d.cases?.skill_version != null ? ` · skill v${d.cases.skill_version}` : ''}
            {d.source === 'sample' ? ' · sample data' : ''}
          </Text>
        </Text>
        {d.status && (
          <Text color={d.status.state === 'failed' ? 'error' : d.status.state === 'needs_review' ? 'warning' : undefined} dimColor={d.status.state === 'done'}>
            {d.status.activity}
          </Text>
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="tab-spec" hotkey="1" variant={current === 'spec' ? 'primary' : undefined} onPress={() => update($, tab, () => 'spec' as Tab)}>
            Spec{openQuestions ? ` (${openQuestions})` : ''}
          </Button>
          <Button key="tab-process" hotkey="2" variant={current === 'process' ? 'primary' : undefined} onPress={() => update($, tab, () => 'process' as Tab)}>
            Process
          </Button>
          <Button key="tab-improve" hotkey="3" variant={current === 'improve' ? 'primary' : undefined} onPress={() => update($, tab, () => 'improve' as Tab)}>
            Improve{last ? ` ${Math.round((100 * (last.correct ?? last.passed)) / last.total)}%` : ''}
          </Button>
        </Box>
      </Box>
    )

    // ---- Spec: SOP to checked spec -------------------------------------------
    const specTab = async () => {
      const spec = d.spec
      if (!spec) return <Text dimColor>No spec yet. Ask Claude to turn your SOP into a spec.</Text>
      const sopOpen = await read($, showSop)
      // A paragraph the spec covers without a rule of its own (the outcome order, the unknowns rule) is covered.
      const uncovered = spec.sop.filter(s => s.covered === false || (s.covered === undefined && s.rules.length === 0))
      const unwritten = spec.findings.filter(f => !asked(f) && !findingAnswer(d, f))
      const covered = spec.sop.length - uncovered.length
      const ordered = [...spec.findings].sort((a, b) => Number(!!findingAnswer(d, a)) - Number(!!findingAnswer(d, b)))
      const disagreements = spec.past_cases
      const seen = seenOf(d)
      const toSend = unsent(d)
      const open = spec.findings.filter(f => !findingAnswer(d, f)).length + disagreements.filter(p => !pastVerdict(d, p)).length
      // The prompt names every answer in the batch, in the expert's words, and the command that applies it.
      const sendPrompt = () => {
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
      const optionImpact = (f: Finding, opt: string) => {
        const says = f.option_edits?.find(o => o.option === opt)?.says
        const i = f.impact?.find(x => x.option === opt)
        const n = i?.changes.length ?? 0
        return (
          <Box flexDirection="column">
            {says && <Text dimColor>  {says}</Text>}
            {!i ? (
              f.option_edits && <Text dimColor>  What this changes hasn't been worked out yet.</Text>
            ) : i.problems.length > 0 ? (
              <Text color="error">  Can't be applied: {i.problems.join(' ')}</Text>
            ) : (
              <Box flexDirection="column">
                {i.keeps_rules ? (
                  <Text dimColor>  Keeps the rules as they are.</Text>
                ) : (
                  <Text dimColor>
                    {'  '}
                    {n === 0
                      ? i.searched_items_per_list ? `No case with up to ${i.searched_items_per_list} items in each list decides differently.` : 'No case decides differently.'
                      : `${n} ${n === 1 ? 'kind of case decides' : 'kinds of case decide'} differently, e.g. ${label(i.changes[0]!.from).label.toLowerCase()} → ${label(i.changes[0]!.to).label.toLowerCase()}: ${i.changes[0]!.example}`}
                  </Text>
                )}
                {i.flips.length > 0 && (
                  <Text dimColor>
                    {'  '}Past cases that change: {i.flips.map(x => `${x.name} (${label(x.from).label.toLowerCase()} → ${label(x.to).label.toLowerCase()})`).join(', ')}
                  </Text>
                )}
                {i.matches_past !== null && <Text dimColor>  Agrees with {i.matches_past} of {i.past_decided} past team decisions.</Text>}
                {!i.keeps_rules && !i.resolves && <Text color="warning">  Z3 would still report this problem.</Text>}
                {i.new_findings.map(x => (
                  <Text color="warning">  New problem it would cause: {x.title}</Text>
                ))}
              </Box>
            )}
          </Box>
        )
      }

      return (
        <Box flexDirection="column" gap={1}>
          <Text>
            {covered} of {spec.sop.length} SOP paragraphs are covered by the spec.{' '}
            {uncovered.length > 0 && <Text color="warning">Not covered: {uncovered.map(s => s.ref).join(', ')}. </Text>}
            <Text dimColor>{spec.rules.length} rules, checked by Z3 for every possible case.</Text>
          </Text>

          <Text weight="bold">Questions for the expert</Text>
          {unwritten.length > 0 && (
            <Box flexDirection="row" gap={1}>
              <Text dimColor>
                Z3 found {unwritten.length} {unwritten.length === 1 ? 'problem' : 'problems'} with no question written yet.
              </Text>
              <Button
                key="write-questions"
                onPress={() =>
                  fill($, 'Run `pnpm write-options` to write a question and options for each finding in the Resolve pane that has none, then `pnpm resolve` to work out what each option changes.')
                }
              >
                Ask Claude to write them
              </Button>
            </Box>
          )}
          {ordered.map(f => {
            const chosen = findingAnswer(d, f)
            return (
              <Box key={`f-${f.id}`} flexDirection="column" borderStyle="round" borderColor={chosen ? 'subtle' : 'warning'} paddingX={1}>
                <Text>
                  <Text color={chosen ? 'subtle' : 'warning'}>{KIND[f.kind]}</Text>
                  <Text dimColor> · SOP {f.sop_refs.join(', ')}</Text>
                  {f.severity === 'high' && !chosen && <Text color="warning"> · can change a decline or an approve</Text>}
                </Text>
                <Text weight="bold" dimColor={!!chosen}>{f.title}</Text>
                {!chosen && !!f.example && <Text>Example: {f.example}</Text>}
                {!chosen &&
                  (f.example_facts ?? []).map(x => (
                    <Text dimColor>
                      {'  '}
                      {x.name}
                      {x.item ? ` (${x.list === 'people' ? 'person' : 'item'} ${x.item})` : ''}: <Text color={x.value === 'unknown' ? 'warning' : undefined}>{x.value}</Text>
                    </Text>
                  ))}
                {!chosen && f.ownership && ownershipView(f.ownership)}
                {!chosen && <Text dimColor>{f.explain}</Text>}
                {f.question && <Text>{f.question}</Text>}
                {!chosen && !asked(f) ? (
                  <Text dimColor>No question written yet.</Text>
                ) : chosen?.sent && f.answer ? (
                  <Text color="success">Answered: {chosen.choice}</Text>
                ) : (
                  <Box flexDirection="column">
                    {chosen?.sent && <Text color="success">Sent: {chosen.choice}. If Claude reports a clash with another answer, pick again and send.</Text>}
                    {chosen && !chosen.sent && <Text color="warning">Your answer: {chosen.choice} · not sent yet. Press another option to change it.</Text>}
                    {f.options.map(opt => {
                      const blocked = (f.impact?.find(x => x.option === opt)?.problems.length ?? 0) > 0
                      return (
                        <Box flexDirection="column">
                          {blocked ? (
                            <Text dimColor>{opt}</Text>
                          ) : (
                            <Button
                              key={`f-${f.id}-${opt}`}
                              variant={chosen?.choice === opt ? 'primary' : undefined}
                              onPress={() => append($, [{ type: 'finding', id: f.id, rule_ids: f.rule_ids ?? [], choice: opt, at: now() }], seen)}
                            >
                              {opt}
                            </Button>
                          )}
                          {optionImpact(f, opt)}
                        </Box>
                      )
                    })}
                  </Box>
                )}
              </Box>
            )
          })}

          {disagreements.length > 0 && <Text weight="bold">Past cases that decide differently</Text>}
          {disagreements.map(p => {
            const v = pastVerdict(d, p)
            // A team decision when there is one; on a later version, what the version before gave.
            const before = p.past_decision ?? p.previous_spec_decision ?? null
            return (
              <Box key={`p-${p.case_id}`} flexDirection="column" paddingX={1}>
                <Text>
                  <Text weight="bold">{p.name}</Text>
                  <Text dimColor> {p.case_id}</Text>
                </Text>
                <Text>
                  {p.past_decision ? 'Your team: ' : `Spec v${spec.version - 1}: `}
                  <Text color={label(before).color}>{label(before).label}</Text>
                  {'   '}Spec v{spec.version}: <Text color={label(p.spec_decision).color}>{label(p.spec_decision).label}</Text>
                </Text>
                <Text dimColor>{p.why}</Text>
                {v?.sent ? (
                  <Text color="success">{v.choice === 'past_right' ? 'Earlier decision was right: sent' : 'Spec was right: sent'}</Text>
                ) : (
                  <Box flexDirection="row" gap={1}>
                    {v && <Text color="warning">not sent yet</Text>}
                    <Button
                      key={`p-${p.case_id}-past`}
                      variant={v?.choice === 'past_right' ? 'primary' : undefined}
                      onPress={() => append($, [{ type: 'past_case', case_id: p.case_id, verdict: 'past_right', at: now() }], seen)}
                    >
                      {p.past_decision ? 'Team was right' : 'Earlier version was right'}
                    </Button>
                    <Button
                      key={`p-${p.case_id}-spec`}
                      variant={v?.choice === 'spec_right' ? 'primary' : undefined}
                      onPress={() => append($, [{ type: 'past_case', case_id: p.case_id, verdict: 'spec_right', at: now() }], seen)}
                    >
                      Spec was right
                    </Button>
                  </Box>
                )}
              </Box>
            )
          })}

          {(spec.changes_from_previous ?? []).length > 0 && (
            <Box flexDirection="column">
              <Text weight="bold">What changes from v{spec.version - 1}</Text>
              {(spec.changes_from_previous ?? []).map(ch => (
                <Text>
                  {'  '}
                  <Text color={label(ch.from).color}>{label(ch.from).label}</Text> →{' '}
                  <Text color={label(ch.to).color}>{label(ch.to).label}</Text>
                  <Text dimColor>  e.g. {ch.example}</Text>
                </Text>
              ))}
            </Box>
          )}

          {toSend.length > 0 && (
            <Box flexDirection="row" gap={1} borderStyle="round" borderColor="warning" paddingX={1}>
              <Text color="warning">
                {toSend.length} {toSend.length === 1 ? 'answer' : 'answers'} ready
              </Text>
              <Button
                key="send"
                variant="primary"
                onPress={() => append($, [{ type: 'send', ids: toSend.map(a => a.id), at: now() }], seen, sendPrompt())}
              >
                Send to Claude
              </Button>
            </Box>
          )}

          <Box flexDirection="row" gap={1}>
            {approved(d) ? (
              <Text color="success">Spec v{spec.version} approved</Text>
            ) : approvalSent(d) ? (
              <Text color="success">Approval of spec v{spec.version} sent. Claude records it with pnpm resolve.</Text>
            ) : unwritten.length > 0 ? (
              <Text dimColor>Spec v{spec.version} can be approved once Claude has written its questions and you've answered them.</Text>
            ) : open > 0 || toSend.length > 0 ? (
              <Text dimColor>
                {open > 0 ? `Answer the ${open} open ${open === 1 ? 'item' : 'items'}` : 'Send your answers'} before approving spec v{spec.version}.
              </Text>
            ) : (
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
            )}
            <Button key="toggle-sop" onPress={() => update($, showSop, v => !v)}>
              {sopOpen ? 'Hide SOP and rules' : 'Show SOP and rules'}
            </Button>
          </Box>

          {sopOpen &&
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
                ) : uncovered.includes(s) ? (
                  <Text color="warning">  no rule</Text>
                ) : (
                  <Text dimColor>  covered by the spec itself</Text>
                )}
              </Box>
            ))}
        </Box>
      )
    }

    // ---- Process: the skill run on cases --------------------------------------
    const processTab = async () => {
      const run = d.cases
      if (!run) return <Text dimColor>No cases run yet. Ask Claude to write the processing skill and run it.</Text>
      const opened = await read($, openCase)
      const c = run.cases.find(x => x.id === opened)
      if (c) return caseDetail(c)
      const counts = (Object.keys(OUTCOME) as Outcome[]).map(o => [o, run.cases.filter(x => x.outcome === o).length] as const)
      const counted = run.cases.filter(x => typeof x.tool_calls === 'number')
      const calls = counted.reduce((n, x) => n + (x.tool_calls as number), 0)

      return (
        <Box flexDirection="column" gap={1}>
          <Text>
            {run.cases.length} cases
            {run.skill_version != null ? ` with skill v${run.skill_version}` : ''}
            {counted.length ? ` · ${calls} tool calls` : ''}
          </Text>
          <Text>
            {counts
              .filter(([, n]) => n > 0)
              .map(([o, n]) => (
                <Text color={OUTCOME[o].color}>
                  {OUTCOME[o].label} {n}
                  {'   '}
                </Text>
              ))}
          </Text>
          <Box flexDirection="column">
            {run.cases.map(x => (
              <Button key={`case-${x.id}`} plain onPress={() => update($, openCase, () => x.id)}>
                <Text color={OUTCOME[x.outcome].color}>{OUTCOME[x.outcome].label.padEnd(18)}</Text>
                {x.name}
                <Text dimColor>{x.missing.length ? `  missing ${x.missing.length}` : ''}</Text>
                {x.check?.outcome_follows === false && <Text color="error">  outcome doesn't follow</Text>}
                {x.check && (x.check.problems.length > 0 || (x.check.flags ?? []).length > 0) && <Text color="warning">  to check</Text>}
              </Button>
            ))}
          </Box>
          <Button
            key="run-cases"
            onPress={() => fill($, `Run the kyb-review skill on every case and write the results to ${DIR}/cases.json.`)}
          >
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

    const caseDetail = (c: CaseFile) => (
      <Box flexDirection="column" gap={1}>
        <Button key="back" plain onPress={() => update($, openCase, () => null)}>
          ← All cases
        </Button>
        <Text>
          <Text weight="bold">{c.name}</Text>
          <Text dimColor> {c.id}</Text>
        </Text>
        <Text>
          <Text color={OUTCOME[c.outcome].color} weight="bold">
            {OUTCOME[c.outcome].label}
          </Text>
          <Text dimColor> because {c.decided_by}</Text>
        </Text>
        {(c.notes ?? []).map(n => (
          <Text dimColor>  {n}</Text>
        ))}
        {c.check && (
          <Box flexDirection="column">
            {c.check.outcome_follows === undefined && !c.check.passed && <Text color="error">The check on this case file failed.</Text>}
            {c.check.outcome_follows !== undefined && (
              <Text color={c.check.outcome_follows ? 'success' : 'error'}>
                {c.check.outcome_follows
                  ? 'The rules give this outcome on the facts in the file.'
                  : `The rules give ${c.check.spec_outcome ? OUTCOME[c.check.spec_outcome].label.toLowerCase() : 'a different outcome'} on the facts in the file.`}
                {c.check.expected && <Text dimColor> · known answer: {OUTCOME[c.check.expected].label}</Text>}
              </Text>
            )}
            {(c.check.problems.length > 0 || (c.check.flags ?? []).length > 0) && (
              <Box flexDirection="column">
                <Text color="warning">For a person to check</Text>
                {[...c.check.problems, ...(c.check.flags ?? [])].map(p => (
                  <Text>  • {p}</Text>
                ))}
                {c.check.outcome_follows !== undefined && (
                  <Text dimColor>  From the example evidence checks. Resolve takes the facts as given; it doesn't verify the evidence.</Text>
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
          <Text weight="bold">Case file</Text>
          {c.facts.map(f => (
            <Box flexDirection="column">
              <Text>
                {f.name}: <Text color={f.value === 'unknown' ? 'warning' : undefined} weight="semibold">{f.value}</Text>
              </Text>
              <Text dimColor>
                {'  '}
                {f.source}
                {f.how === 'judgment' ? (f.by ? ` · a judgment call, by ${f.by}` : ' · a judgment call') : ''}
              </Text>
              {f.problem && <Text color="warning">  {f.problem}</Text>}
            </Box>
          ))}
        </Box>
        {typeof c.tool_calls === 'number' && <Text dimColor>{c.tool_calls} tool calls</Text>}
      </Box>
    )

    // ---- Improve: verify the processing, loop ---------------------------------
    const improveTab = () => {
      const r = d.rounds
      if (!r || r.rounds.length === 0) return <Text dimColor>No checks run yet. Ask Claude to check every case file against the spec.</Text>
      const latest = r.rounds.at(-1) as Round
      const accepted = Math.max(
        r.accepted_version ?? 0,
        ...d.answers.flatMap(a => (a.type === 'accept_skill' && sameSpec(a, d) ? [a.version] : [])),
      )
      const w = Math.min(30, width - 22)

      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            Correct: the outcome matches the known answer. Consistent: the case file's outcome follows from its facts under the spec. Claude may change the skill, never the spec or these checks.
          </Text>
          <Box flexDirection="column">
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
          {latest.got_worse.length > 0 && <Text color="error">Got worse this round: {latest.got_worse.join(', ')}</Text>}
          <Text weight="bold">Still failing, grouped by cause</Text>
          {latest.groups.map(g => (
            <Box key={`g-${g.cause}`} flexDirection="column" paddingX={1}>
              <Text>
                {g.cause} <Text dimColor>({g.cases.length} cases)</Text>
              </Text>
              <Text dimColor>Change: {g.change}</Text>
            </Box>
          ))}
          {latest.back_to_spec.length > 0 && (
            <Box flexDirection="column">
              <Text weight="bold">Needs the expert, not the skill</Text>
              {latest.back_to_spec.map(s => (
                <Text color="warning">  • {s}</Text>
              ))}
            </Box>
          )}
          <Box flexDirection="row" gap={1}>
            <Button
              key="next-round"
              onPress={() =>
                fill($, `Run another improvement round: change the kyb-review skill to fix the biggest failure group, re-run every case, and write ${DIR}/rounds.json. Don't edit the spec or the checker.`)
              }
            >
              Run another round
            </Button>
            {accepted >= latest.skill_version ? (
              <Text color="success">Skill v{latest.skill_version} accepted</Text>
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
        </Box>
      )
    }

    const body = current === 'spec' ? await specTab() : current === 'process' ? await processTab() : improveTab()

    return (
      <Box flexDirection="column">
        {header}
        {body}
      </Box>
    )
  })
}
