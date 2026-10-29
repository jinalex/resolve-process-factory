import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface } from 'claude-code'

import type { Answer, CaseFile, Finding, Outcome, Ownership, PastCase, Round, RunData, Tab } from '../types'
import { SAMPLE } from './sample'

// The logic writes spec.json, cases.json and rounds.json here; the pane only
// appends to answers.jsonl. Contract: docs/INTERFACE.md at the repo root.
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
  const answers = await readAnswers($)
  const real = spec !== null || cases !== null || rounds !== null
  const next: RunData = real
    ? { source: 'folder', spec, cases, rounds, answers }
    : { source: 'sample', ...(JSON.parse(JSON.stringify(SAMPLE)) as Omit<RunData, 'source' | 'answers'>), answers }
  const raw = JSON.stringify(next)
  if (raw === lastRaw) return
  lastRaw = raw
  await update($, data, () => next)
}

async function record($: EngineInterface, answer: Answer, prompt: string) {
  const path = `${DIR}/answers.jsonl`
  const before = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
  await $.fs.write(path, before + JSON.stringify(answer) + '\n')
  await load($)
  // Hand the decision to Claude in the chat; the person presses Enter to send it.
  await $.prompt.fill({ text: prompt })
}

const now = () => new Date().toISOString()

// The pane overlays answers the person gave on top of what the logic last wrote,
// so a press shows at once even before the logic has caught up.
function findingAnswer(d: RunData, f: Finding) {
  const a = [...d.answers].reverse().find(x => x.type === 'finding' && x.id === f.id)
  return a && a.type === 'finding' ? a.choice : f.answer?.choice ?? null
}

function pastVerdict(d: RunData, p: PastCase) {
  const a = [...d.answers].reverse().find(x => x.type === 'past_case' && x.case_id === p.case_id)
  return a && a.type === 'past_case' ? a.verdict : p.verdict
}

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

    const openQuestions = d.spec ? d.spec.findings.filter(f => !findingAnswer(d, f)).length : 0
    const last = d.rounds?.rounds.at(-1)

    const header = (
      <Box flexDirection="column" marginBottom={1}>
        <Text>
          <Text weight="bold">{TITLE}</Text>
          <Text dimColor>
            {'  '}
            {d.spec ? `spec v${d.spec.version}` : 'no spec yet'}
            {d.cases ? ` · skill v${d.cases.skill_version}` : ''}
            {d.source === 'sample' ? ' · sample data' : ''}
          </Text>
        </Text>
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
      const uncovered = spec.sop.filter(s => s.rules.length === 0)
      const covered = spec.sop.length - uncovered.length
      const ordered = [...spec.findings].sort((a, b) => Number(!!findingAnswer(d, a)) - Number(!!findingAnswer(d, b)))
      const disagreements = spec.past_cases
      const pending = openQuestions + disagreements.filter(p => !pastVerdict(d, p)).length

      return (
        <Box flexDirection="column" gap={1}>
          <Text>
            {covered} of {spec.sop.length} SOP sentences became rules.{' '}
            {uncovered.length > 0 && <Text color="warning">Not covered: {uncovered.map(s => s.ref).join(', ')}. </Text>}
            <Text dimColor>{spec.rules.length} rules, checked by Z3 for every possible case.</Text>
          </Text>

          <Text weight="bold">Questions for the expert</Text>
          {ordered.map(f => {
            const chosen = findingAnswer(d, f)
            return (
              <Box key={`f-${f.id}`} flexDirection="column" borderStyle="round" borderColor={chosen ? 'subtle' : 'warning'} paddingX={1}>
                <Text>
                  <Text color={chosen ? 'subtle' : 'warning'}>{KIND[f.kind]}</Text>
                  <Text dimColor> · SOP {f.sop_refs.join(', ')}</Text>
                </Text>
                <Text weight="bold" dimColor={!!chosen}>{f.title}</Text>
                {!chosen && <Text>Example: {f.example}</Text>}
                {!chosen &&
                  (f.example_facts ?? []).map(x => (
                    <Text dimColor>
                      {'  '}
                      {x.name}: <Text color={x.value === 'unknown' ? 'warning' : undefined}>{x.value}</Text>
                    </Text>
                  ))}
                {!chosen && f.ownership && ownershipView(f.ownership)}
                {!chosen && <Text dimColor>{f.explain}</Text>}
                <Text>{f.question}</Text>
                {chosen ? (
                  <Text color="success">Answered: {chosen}</Text>
                ) : (
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    {f.options.map(opt => (
                      <Button
                        key={`f-${f.id}-${opt}`}
                        onPress={() =>
                          record(
                            $,
                            { type: 'finding', id: f.id, choice: opt, at: now() },
                            `The compliance owner answered "${f.question}" with "${opt}". Update the spec, re-run the checks, and tell me what changed.`,
                          )
                        }
                      >
                        {opt}
                      </Button>
                    ))}
                  </Box>
                )}
              </Box>
            )
          })}

          {disagreements.length > 0 && <Text weight="bold">Past cases where the spec disagrees</Text>}
          {disagreements.map(p => {
            const v = pastVerdict(d, p)
            return (
              <Box key={`p-${p.case_id}`} flexDirection="column" paddingX={1}>
                <Text>
                  <Text weight="bold">{p.name}</Text>
                  <Text dimColor> {p.case_id}</Text>
                </Text>
                <Text>
                  Your team: <Text color={OUTCOME[p.past_decision].color}>{OUTCOME[p.past_decision].label}</Text>
                  {'   '}Spec: <Text color={OUTCOME[p.spec_decision].color}>{OUTCOME[p.spec_decision].label}</Text>
                </Text>
                <Text dimColor>{p.why}</Text>
                {v ? (
                  <Text color="success">{v === 'past_right' ? 'Team was right: spec will change' : 'Spec was right: case saved as a test'}</Text>
                ) : (
                  <Box flexDirection="row" gap={1}>
                    <Button
                      key={`p-${p.case_id}-past`}
                      onPress={() =>
                        record(
                          $,
                          { type: 'past_case', case_id: p.case_id, verdict: 'past_right', at: now() },
                          `For past case ${p.case_id} (${p.name}), the team's decision was right and the spec is wrong. Propose a spec change, show its effect on every past case, and wait for my approval.`,
                        )
                      }
                    >
                      Team was right
                    </Button>
                    <Button
                      key={`p-${p.case_id}-spec`}
                      onPress={() =>
                        record(
                          $,
                          { type: 'past_case', case_id: p.case_id, verdict: 'spec_right', at: now() },
                          `For past case ${p.case_id} (${p.name}), the spec is right and the old decision was a mistake. Save it as a test case with the spec's outcome.`,
                        )
                      }
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
                  <Text color={OUTCOME[ch.from].color}>{OUTCOME[ch.from].label}</Text> →{' '}
                  <Text color={OUTCOME[ch.to].color}>{OUTCOME[ch.to].label}</Text>
                  <Text dimColor>  e.g. {ch.example}</Text>
                </Text>
              ))}
            </Box>
          )}

          <Box flexDirection="row" gap={1}>
            {spec.approved || d.answers.some(a => a.type === 'approve_spec' && a.version === spec.version) ? (
              <Text color="success">Spec v{spec.version} approved</Text>
            ) : pending > 0 ? (
              <Text dimColor>Answer the {pending} open items to approve spec v{spec.version}.</Text>
            ) : (
              <Button
                key="approve-spec"
                variant="primary"
                onPress={() =>
                  record($, { type: 'approve_spec', version: spec.version, at: now() }, `I approve spec v${spec.version}. Next, write the case-processing skill for it.`)
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
                {s.rules.length === 0 ? (
                  <Text color="warning">  no rule</Text>
                ) : (
                  s.rules.map(id => <Text>  → {spec.rules.find(r => r.id === id)?.says ?? id}</Text>)
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
      const calls = run.cases.reduce((n, x) => n + x.tool_calls, 0)

      return (
        <Box flexDirection="column" gap={1}>
          <Text>
            {run.cases.length} cases with skill v{run.skill_version} · {calls} tool calls
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
                {x.check && !x.check.passed && <Text color="error">  check failed</Text>}
              </Button>
            ))}
          </Box>
          <Button
            key="run-cases"
            onPress={() => $.prompt.fill({ text: `Run the kyb-review skill on every case and write the results to ${DIR}/cases.json.` })}
          >
            Run all cases again
          </Button>
        </Box>
      )
    }

    const ownershipView = (o: Ownership) => (
      <Box flexDirection="column">
        <Text weight="bold">Ownership</Text>
        {o.holders.map(holder => (
          <Text>
            {'  '}
            {String(holder.pct).padStart(3)}% {holder.name}
            <Text color={holder.type === 'entity' && !holder.owners ? 'warning' : undefined} dimColor={!(holder.type === 'entity' && !holder.owners)}>
              {holder.type === 'entity'
                ? holder.owners
                  ? '  company, owners known'
                  : '  company, owners unknown'
                : holder.type === 'pool'
                  ? '  option pool'
                  : holder.verified
                    ? '  verified'
                    : '  not verified'}
            </Text>
            <Text dimColor> · {holder.source}</Text>
          </Text>
        ))}
        {o.unaccounted_pct > 0 && <Text color="warning">  {String(o.unaccounted_pct).padStart(3)}% unaccounted for</Text>}
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
        {c.check && (
          <Box flexDirection="column">
            <Text color={c.check.passed ? 'success' : 'error'}>
              {c.check.passed ? 'Check passed: the file supports this outcome' : 'Check failed'}
              {c.check.expected && <Text dimColor> · known answer: {OUTCOME[c.check.expected].label}</Text>}
            </Text>
            {c.check.problems.map(p => (
              <Text>  • {p}</Text>
            ))}
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
                {f.how === 'judgment' ? ` · judged by ${f.by ?? 'a model'}${f.confidence !== undefined ? `, ${Math.round(f.confidence * 100)}% sure` : ''}` : ''}
              </Text>
            </Box>
          ))}
        </Box>
        <Text dimColor>{c.tool_calls} tool calls</Text>
      </Box>
    )

    // ---- Improve: verify the processing, loop ---------------------------------
    const improveTab = () => {
      const r = d.rounds
      if (!r || r.rounds.length === 0) return <Text dimColor>No checks run yet. Ask Claude to check every case file against the spec.</Text>
      const latest = r.rounds.at(-1) as Round
      const accepted = Math.max(
        r.accepted_version ?? 0,
        ...d.answers.flatMap(a => (a.type === 'accept_skill' ? [a.version] : [])),
      )
      const w = Math.min(30, width - 22)

      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            Correct: the outcome matches the known answer. Consistent: the case file meets every evidence requirement and its outcome follows from its facts under the spec. Claude may change the skill, never the spec or these checks.
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
                $.prompt.fill({
                  text: `Run another improvement round: change the kyb-review skill to fix the biggest failure group, re-run every case, and write ${DIR}/rounds.json. Don't edit the spec or the checker.`,
                })
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
                  record(
                    $,
                    { type: 'accept_skill', version: latest.skill_version, at: now() },
                    `I accept skill v${latest.skill_version}. Save it as the current version of the kyb-review skill.`,
                  )
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
