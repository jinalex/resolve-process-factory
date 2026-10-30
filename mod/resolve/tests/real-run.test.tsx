import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { SPEC, CASES, STATUS } from './real-run'

// What `pnpm resolve` writes, copied into real-run.ts: the pane must draw a real run, not only its sample.
const PANE = {
  plugin: 'resolve', component: 'Pane', requestId: 'resolve',
  props: { title: 'Claude Resolve', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

// A fake project folder holding a run, plus what the pane appends and the prompts it fills.
function project(spec: unknown, extra: Record<string, string> = {}) {
  const files: Record<string, string> = {
    '.resolve/spec.json': JSON.stringify(spec),
    '.resolve/cases.json': JSON.stringify(CASES),
    '.resolve/status.json': JSON.stringify(STATUS),
    ...extra,
  }
  const filled: string[] = []
  const rel = (e: unknown) => (e as { path: string }).path.replace(/^.*?(\.resolve\/)/, '$1')
  const wire = (on: Parameters<TestBody>[1]) => {
    on('command.register', () => ({ value: { command: 'resolve' } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('clock.every', () => ({ value: undefined }))
    on('tool.register', () => ({ value: { tool: 'mcp__resolve__open_pane' } }))
    on('fs.exists', (_, e) => ({ value: rel(e) in files }))
    on('fs.read', (_, e) => ({ value: files[rel(e)] ?? '' }))
    on('fs.write', (_, e) => {
      files[rel(e)] = (e as { text: string }).text
      return { value: undefined }
    })
    on('prompt.fill', (_, e) => {
      filled.push((e as { text: string }).text)
      return { isFilled: true }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
  }
  return { files, filled, wire }
}

const has = async (ui: { find: (q: object) => Promise<{ text?: string } | undefined> }, text: RegExp) => !!(await ui.find({ type: 'Text', text }))?.text

// Ownership and the case file are Markdown tables: find text inside them.
const mdHas = async (ui: unknown, re: RegExp) =>
  ((await (ui as { findAll: (q: object) => Promise<{ props?: { text?: string }; text?: string }[]> }).findAll({ type: 'Markdown' })) ?? [])
    .some(m => re.test(m.props?.text ?? m.text ?? ''))

test('every tab draws a real run from pnpm resolve, on every surface', async ($, on) => {
  project(SPEC).wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await has(ui, /3 of 3 findings on the rules need/)).toBe(false)            // the strip says it; the activity line is for while Claude works
    expect(await has(ui, /Z3 found 3 problems in the rules/)).toBe(true)              // no question written yet: one card names them
    expect(await ui.find({ type: 'Button', text: /5\.3 can never decide a case/ })).toBeTruthy()   // opens its SOP sections
    expect(await ui.find({ type: 'Button', text: /15 of 16 SOP sections covered/ })).toBeTruthy()   // 2.1 and 2.2 are covered by the spec itself
    expect(await has(ui, /Not covered: 2\.1/)).toBe(false)
    expect(await has(ui, /No question written yet/)).toBe(true)
    expect(await has(ui, /Example: $/)).toBe(false)
    expect(await has(ui, /skill vnull|NaN/)).toBe(false)

    await ui.press({ key: 'tab-process' })
    expect(await has(ui, /^6 cases/)).toBe(true)
    await ui.press({ key: 'case-EX-2' })
    expect(await has(ui, /because 3\.3: Unless the entity is excluded/)).toBe(true)
    expect(await has(ui, /^Matches the file's outcome\.$/)).toBe(true)
    expect(await mdHas(ui, /\| Unidentified holders \| 30% \| \*\*not identified\*\* \|/)).toBe(true)
    expect(await has(ui, /option pool|supports this outcome|Check passed/)).toBe(false)
    await ui.press({ key: 'back' })
    await ui.press({ key: 'case-EX-5' })
    expect(await has(ui, /For a person to check/)).toBe(true)
    expect(await has(ui, /Documents disagree on where Dariush Karimi lives/)).toBe(true)
    expect(await has(ui, /doesn't verify evidence/)).toBe(true)
    await ui.press({ key: 'back' })
    await ui.press({ key: 'case-EX-1' })
    expect(await mdHas(ui, /\| Priya Shah \(via Halcyon Holdings LLC\) \| 40% \|/)).toBe(true)                                   // Halcyon's owner, walked down from the company
    await ui.press({ key: 'back' })
    await ui.press({ key: 'tab-spec' })
    await ui.unmount()
  }
})

const pressAll = (ui: { press: (q: { key: string }) => Promise<unknown> }, keys: string[]) => Promise.all(keys.map(key => ui.press({ key })))
const lines = (files: Record<string, string>) => (files['.resolve/answers.jsonl'] ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))

test('answers stay on the spec on screen, two quick presses both land, and one send hands Claude the batch', async ($, on) => {
  const spec = JSON.parse(JSON.stringify(SPEC))
  spec.spec_hash = 'h1'
  spec.findings[0] = { ...spec.findings[0], question: 'Should 5.3 win over 5.2?', options: ['Yes', 'No'] }
  spec.findings[1] = { ...spec.findings[1], question: 'Incomplete first?', options: ['Yes', 'No'] }
  const f0 = spec.findings[0], f1 = spec.findings[1]
  const stale = [
    { type: 'finding', id: f1.id, rule_ids: f1.rule_ids, choice: 'No', spec_version: 0, at: 'x' },                    // another version
    { type: 'finding', id: f1.id, rule_ids: f1.rule_ids, choice: 'No', spec_version: 1, spec_hash: 'h0', at: 'x' },   // an earlier edit of v1
    { type: 'finding', id: f1.id, rule_ids: ['other'], choice: 'No', spec_version: 1, spec_hash: 'h1', at: 'x' },     // other rules
  ].map(l => JSON.stringify(l)).join('\n') + '\n'
  const p = project(spec, { '.resolve/answers.jsonl': stale })
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await has(ui, /Your answer: No|Answered: No|Sent: No/)).toBe(false)
  expect(await has(ui, /answers? ready/)).toBe(false)                                 // stale lines never ride along in a send
  await pressAll(ui, [`f-${f0.id}-No`, `f-${f0.id}-Yes`])                             // two quick presses both land; the later counts
  await ui.press({ key: `f-${f1.id}-Yes` })                                          // an answer moves NEXT on to the next question
  const after = lines(p.files)
  expect(after.length).toBe(6)
  expect(after[3]).toMatchObject({ type: 'finding', id: f0.id, choice: 'No' })
  expect(after[4]).toMatchObject({ type: 'finding', id: f0.id, rule_ids: f0.rule_ids, choice: 'Yes', spec_version: 1, spec_hash: 'h1' })
  expect(after[5]).toMatchObject({ type: 'finding', id: f1.id, rule_ids: f1.rule_ids, choice: 'Yes', spec_version: 1, spec_hash: 'h1' })
  expect(p.filled).toEqual([])                                                       // a press alone sends nothing
  expect(await has(ui, /2 answers ready/)).toBe(true)

  await ui.press({ key: 'send' })
  expect(lines(p.files)[6]).toMatchObject({ type: 'send', ids: [f0.id, f1.id], spec_version: 1, spec_hash: 'h1' })
  expect(p.filled.length).toBe(1)
  expect(p.filled[0]).toContain('"Should 5.3 win over 5.2?": Yes')
  expect(p.filled[0]).toContain('"Incomplete first?": Yes')
  expect(p.filled[0]).toContain('pnpm next-spec')
  expect(await has(ui, /^sent$/)).toBe(true)
  expect(await has(ui, /answers? ready/)).toBe(false)
  await ui.press({ key: `q-${f0.id}` })                                               // re-answer after a clash: still possible until applied
  await ui.press({ key: `f-${f0.id}-No` })
  expect(await has(ui, /1 answer ready/)).toBe(true)

  await ui.press({ key: 'write-questions' })                                        // the third finding has no question yet
  expect(p.filled.at(-1)).toContain('pnpm write-options')
  await ui.unmount()
})

test('each option shows what pnpm resolve worked out it would change', async ($, on) => {
  const spec = JSON.parse(JSON.stringify(SPEC))
  const f = spec.findings[0]
  spec.findings[0] = {
    ...f, question: 'Should a verified licence skip 5.2?', options: ['Skip 5.2', 'Keep 5.2', 'Bad'],
    option_edits: [{ option: 'Skip 5.2', says: 'A licensed MSB with a verified licence is approved.' }, { option: 'Keep 5.2', says: 'Every MSB escalates.' }, { option: 'Bad', says: 'x' }],
    impact: [
      { option: 'Skip 5.2', problems: [], keeps_rules: false, resolves: true, new_findings: [{ id: 'n1', title: '5.2 treats an unknown licence differently from 2.2' }],
        changes: [{ from: 'escalate', to: 'approve', example: 'An MSB whose licence is verified.' }], searched_items_per_list: null,
        flips: [{ case_id: 'EX-3', name: 'Cedar Ridge Payments', from: 'escalate', to: 'approve' }], matches_past: null, past_decided: 0 },
      { option: 'Keep 5.2', problems: [], keeps_rules: true, resolves: false, new_findings: [], changes: [], searched_items_per_list: null, flips: [], matches_past: null, past_decided: 0 },
      { option: 'Bad', problems: ['The edit names a rule the spec doesn\'t have.'], keeps_rules: false, resolves: false, new_findings: [], changes: [], searched_items_per_list: null, flips: [], matches_past: null, past_decided: 0 },
    ],
  }
  project(spec).wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // One line under the option: the past cases it flips, every kind of change, and that it raises a new question.
  expect(await has(ui, /^Cedar Ridge Payments: Escalate → Approve · 1 kind of case changes: escalate → approve · raises a new question$/)).toBe(true)
  expect(await has(ui, /An MSB whose licence is verified\./)).toBe(false)            // the examples sit behind "What each option changes"
  await ui.press({ key: `details-${f.id}` })
  expect(await has(ui, /^A licensed MSB with a verified licence is approved\.$/)).toBe(true)   // what the option means, in Details
  expect(await has(ui, /^Escalate → Approve: An MSB whose licence is verified\.$/)).toBe(true)
  expect(await has(ui, /^New question: 5\.2 treats an unknown licence/)).toBe(true)
  expect(await has(ui, /Keeps the rules as they are\./)).toBe(true)
  expect(await has(ui, /Can't be used: The edit names a rule/)).toBe(true)
  await expect(ui.press({ key: `f-${f.id}-Bad` })).rejects.toThrow()                  // an option that can't be applied has no button
  await ui.unmount()
})

test('a later version, its past cases with no team decision, and its approval', async ($, on) => {
  const spec = JSON.parse(JSON.stringify(SPEC))
  spec.version = 2
  spec.spec_hash = 'v2hash'
  spec.findings = []
  spec.past_cases = [{ case_id: 'EX-3', name: 'Cedar Ridge Payments', past_decision: null, previous_spec_decision: 'escalate', spec_decision: 'approve', why: '5.3: a verified licence.', verdict: null }]
  const p = project(spec)
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, /Spec v1: Escalate/)).toBe(true)
  expect(await has(ui, /^1 question left before approval$/)).toBe(true)
  await ui.press({ key: 'p-EX-3-spec' })
  await ui.press({ key: 'send' })
  expect(p.filled.at(-1)).toContain("nothing to run")                                // a verdict alone has nothing for next-spec
  expect(p.filled.at(-1)).not.toContain('next-spec')
  await ui.press({ key: 'approve-spec' })
  const l = lines(p.files)
  expect(l[0]).toMatchObject({ type: 'past_case', case_id: 'EX-3', verdict: 'spec_right', spec_version: 2, spec_hash: 'v2hash' })
  expect(l[2]).toMatchObject({ type: 'approve_spec', version: 2, spec_version: 2, spec_hash: 'v2hash' })
  expect(p.filled.at(-1)).toContain('pnpm resolve')
  expect(await has(ui, /^Approval sent\. It takes effect once Claude records it\.$/)).toBe(true)
  expect(await has(ui, /Spec v2 approved/)).toBe(false)                              // only the logic marks it approved
  await ui.unmount()
})

test('the case view: notes, an outcome that does not follow, unreadable shares, excluded owners and a failed reason', async ($, on) => {
  const cases = JSON.parse(JSON.stringify(CASES))
  const c = (id: string) => cases.cases.find((x: { id: string }) => x.id === id)
  c('EX-3').check = { ...c('EX-3').check, outcome_follows: false, spec_outcome: 'approve' }
  c('EX-2').ownership = { holders: [{ name: 'Big Bank (excluded entity)', type: 'entity', pct: 60, source: 'cap_table.md p.1' }, { name: 'Ann Lee', type: 'person', pct: '40 percent', verified: false, source: 'cap_table.md p.1' }], unaccounted_pct: null }
  c('EX-1').facts.find((x: { key: string }) => x.key === 'control_person').problem = "The reasons don't meet 3.2."
  const p = project(SPEC, { '.resolve/cases.json': JSON.stringify(cases) })
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-process' })
  await ui.press({ key: 'case-EX-6' })
  expect(await has(ui, /4\.1 could still apply/)).toBe(true)
  await ui.press({ key: 'back' })
  await ui.press({ key: 'case-EX-3' })
  expect(await has(ui, /The rules give approve on the facts in the file/)).toBe(true)
  await ui.press({ key: 'back' })
  await ui.press({ key: 'case-EX-2' })
  expect(await mdHas(ui, /company, no owners needed/)).toBe(true)
  expect(await mdHas(ui, /\| Ann Lee \| 40 percent \| \*\*no\*\* \|/)).toBe(true)
  expect(await has(ui, /A share couldn't be read/)).toBe(true)
  await ui.press({ key: 'back' })
  await ui.press({ key: 'case-EX-1' })
  expect(await has(ui, /The reasons don't meet 3\.2\./)).toBe(true)
  await ui.press({ key: 'back' })
  await ui.press({ key: 'tab-spec' })
  await ui.unmount()
})

test('a send names an answer pressed just before it, and a later answer to other rules clears the earlier one', async ($, on) => {
  const spec = JSON.parse(JSON.stringify(SPEC))
  spec.spec_hash = 'h1'
  spec.findings[0] = { ...spec.findings[0], question: 'Q0?', options: ['Yes', 'No'] }
  spec.findings[1] = { ...spec.findings[1], question: 'Q1?', options: ['Yes', 'No'] }
  spec.findings[2] = { ...spec.findings[2], question: 'Q2?', options: ['Yes', 'No'] }
  const [f0, f1, f2] = spec.findings
  const seeded = [
    { type: 'finding', id: f2.id, rule_ids: f2.rule_ids, choice: 'Yes', spec_version: 1, spec_hash: 'h1', at: 'x' },
    { type: 'finding', id: f2.id, rule_ids: ['other'], choice: 'No', spec_version: 1, spec_hash: 'h1', at: 'y' },
  ].map(l => JSON.stringify(l)).join('\n') + '\n'
  const p = project(spec, { '.resolve/answers.jsonl': seeded })
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, /answers? ready/)).toBe(false)                                 // f2's latest line is for other rules
  expect(await has(ui, /Your answer: Yes/)).toBe(false)

  await ui.press({ key: `f-${f0.id}-Yes` })
  await Promise.all([ui.press({ key: `f-${f1.id}-No` }), ui.press({ key: 'send' })])
  const send = lines(p.files).find(l => l.type === 'send')
  expect(send.ids).toEqual([f0.id, f1.id])
  expect(p.filled.at(-1)).toContain('"Q0?": Yes')
  expect(p.filled.at(-1)).toContain('"Q1?": No')
  await ui.unmount()
})

test('outcomes the KYB table does not know are drawn by name, not looked up blind', async ($, on) => {
  const cases = JSON.parse(JSON.stringify(CASES))
  cases.cases[0].outcome = 'reject'
  cases.cases[0].check = { ...cases.cases[0].check, spec_outcome: 'return', expected: 'return', outcome_follows: false }
  const spec = JSON.parse(JSON.stringify(SPEC))
  spec.past_cases = [{ case_id: 'CL-1', name: 'Hotel claim', past_decision: 'reject', spec_decision: 'return', why: 'x', verdict: null }]
  project(spec, { '.resolve/cases.json': JSON.stringify(cases) }).wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await has(ui, /Your team: Reject/)).toBe(true)
  await ui.press({ key: 'tab-process' })
  expect(await has(ui, /Reject 1/)).toBe(true)
  await ui.press({ key: `case-${cases.cases[0].id}` })
  expect(await has(ui, /The rules give return on the facts/)).toBe(true)
  await ui.press({ key: 'back' })
  await ui.press({ key: 'tab-spec' })
  await ui.unmount()
})

// What `pnpm improve` writes (bench/results/rounds.md): round 2's notes scored the same as v1's, so Resolve says keep v1.
const ROUNDS = {
  accepted_version: 1,
  rounds: [
    { n: 1, skill_version: 1, passed: 60, correct: 60, total: 60, got_worse: [], groups: [], back_to_spec: [], skill_diff: [],
      runs: 180, usd_per_case: 0.00108, turns_per_case: 4.07, evidence_calls_per_case: 2.22, s_per_case: 6.3,
      recommendation: { accept: false, text: 'v1 is in use.' } },
    { n: 2, skill_version: 2, passed: 60, correct: 60, total: 60, got_worse: [], groups: [], back_to_spec: [], skill_diff: [],
      runs: 180, usd_per_case: 0.00109, turns_per_case: 4.06, evidence_calls_per_case: 2.4, s_per_case: 6.3, compared_to: 1,
      recommendation: { accept: false, text: 'Keep v1: no gain on any measure (a change under 10% is within rerun noise).' } },
  ],
}

test('Rounds sets the latest notes against the ones in use, measure by measure, under the logic\'s recommendation', async ($, on) => {
  const p = project(SPEC, { '.resolve/rounds.json': JSON.stringify(ROUNDS) })
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-improve' })
    expect(await has(ui, /^Round 2 · notes v2 vs v1$/)).toBe(true)
    expect(await mdHas(ui, /\| Correct \| 60\/60 \| 60\/60 \| same \|/)).toBe(true)
    expect(await has(ui, /^Keep v1: no gain on any measure/)).toBe(true)
    expect(await mdHas(ui, /\| Cost per case \| \$0\.0011 \| \$0\.0011 \| \+1%, within noise \|/)).toBe(true)
    expect(await mdHas(ui, /\| Evidence calls \| 2\.2 \| 2\.4 \| \+8%, within noise \|/)).toBe(true)
    expect(await ui.find({ type: 'Button', key: 'accept-notes' })).toBeFalsy()   // no primary Accept when Resolve says keep
    expect(await ui.find({ type: 'Button', text: /Accept v2 anyway/ })).toBeTruthy()
    expect(await has(ui, /in use/)).toBe(true)
    expect(await has(ui, /skill|kyb-review|NaN|undefined/)).toBe(false)
    await ui.unmount()
  }

  // A version Resolve recommends gets the primary Accept, and accepting it marks it in use.
  const cheaper = { ...ROUNDS, rounds: [ROUNDS.rounds[0], { ...ROUNDS.rounds[1], usd_per_case: 0.0009, recommendation: { accept: true, text: 'Accept v2: cost down 17%, nothing got worse.' } }] }
  p.files['.resolve/rounds.json'] = JSON.stringify(cheaper)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-improve' })
  expect(await has(ui, /^Accept v2: cost down 17%/)).toBe(true)
  await ui.press({ key: 'accept-notes' })
  expect(p.files['.resolve/answers.jsonl']).toMatch(/"type":"accept_skill","version":2/)
  expect(await has(ui, /^Notes v2 are in use\.$/)).toBe(true)
  await ui.unmount()
})
