import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { ANSWERS, V1, V2, V3 } from '../hooks/tour-run'

// The pane over the recorded run's stages (hooks/tour-run.ts, the files `pnpm resolve` and `pnpm next-spec` wrote):
// questions not written yet, v1's questions with what each option changes, v2 and what the answers changed, v3 to approve.
const PANE = {
  plugin: 'resolve', component: 'Pane', requestId: 'resolve',
  props: { title: 'Claude Resolve', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const STATUS = { stage: 2, state: 'needs_review', activity: '3 of 3 findings on the rules need an answer.' }
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function project(spec: unknown, cases: unknown, answers: unknown[] = []) {
  const files: Record<string, string> = {
    '.resolve/spec.json': JSON.stringify(spec),
    '.resolve/cases.json': JSON.stringify(cases),
    '.resolve/status.json': JSON.stringify(STATUS),
    ...(answers.length ? { '.resolve/answers.jsonl': answers.map(a => JSON.stringify(a)).join('\n') + '\n' } : {}),
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
    on('store.get', () => ({ value: true }))   // the tour has been seen
    on('session.start', (_, e) => ({ cwd: e.cwd }))
  }
  return { files, filled, wire }
}

type Ui = { find: (q: { type: 'Text' | 'Button'; text: RegExp }) => Promise<{ text?: string } | undefined> }
const shows = async (ui: Ui, re: RegExp, type: 'Text' | 'Button' = 'Text') => !!(await ui.find({ type, text: re }))
const must = async (ui: Ui, re: RegExp, type: 'Text' | 'Button' = 'Text') => {
  if (!(await shows(ui, re, type))) throw new Error(`No ${type} on screen matches ${re}`)
}

test('before Claude writes the questions, one card names the problems and asks Claude to write them', async ($, on) => {
  const spec = copy(V1.spec) as { findings: Record<string, unknown>[] }
  for (const f of spec.findings) Object.assign(f, { question: null, options: [], option_edits: undefined, impact: undefined })
  const p = project(spec, V1.cases)
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await must(ui, /^KYB Onboarding Review/)
    await must(ui, /^Rules 3$/, 'Button')                                    // the stage strip: three things need you
    await must(ui, /Z3 found 3 problems in the rules/)
    await must(ui, /^No question written yet$/)
    await ui.press({ key: 'write-questions' })
    expect(p.filled.at(-1)).toContain('pnpm write-options')
    await ui.unmount()
  }
})

test("v1's questions come one at a time, each option with what it changes, and one send hands Claude the batch", async ($, on) => {
  const p = project(V1.spec, V1.cases)
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await must(ui, /^Next$/)
    await must(ui, /^Contradiction · SOP$/)
    await must(ui, /^5\.3, 5\.2, 2\.1 ↗$/, 'Button')                                  // its SOP sections open the spec
    await must(ui, /^The answer can change a decline or an approve\.$/)            // high severity ranks first
    await must(ui, /^When a money services business's state licence has been verified/)
    // The line under "skips the 5.2 referral" names Cedar Ridge's flip and every kind of change, approve among them.
    await must(ui, /^Cedar Ridge Payments, Inc\.: Escalate → Approve · 3 kinds of case change: .*escalate → approve.* · raises a new question$/)
    await must(ui, /^Keeps the rules as they are\.$/)
    await must(ui, /^Up next  2$/)
    await must(ui, /^▸ When an identified individual's identity check/, 'Button')
    expect(await shows(ui, /answers? ready/)).toBe(false)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const [a1, a2] = ANSWERS as { id: string; choice: string }[]
  await ui.press({ key: `f-${a1!.id}-${a1!.choice}` })
  // The answered question moves to Done and the next one is on top.
  await must(ui, /→ Yes, a verified licence skips the 5\.2 referral$/, 'Button')     // now in Done
  await must(ui, /^not sent yet$/)
  await must(ui, /^1 answer ready$/)
  await ui.press({ key: `q-${a2!.id}` })                                     // pick a question from Up next
  await must(ui, /^When an identified individual's identity check/)
  await ui.press({ key: `f-${a2!.id}-${a2!.choice}` })
  await must(ui, /^2 answers ready$/)
  await ui.press({ key: 'send' })
  expect(p.filled.at(-1)).toContain('I answered 2 questions on spec v1')
  expect(p.filled.at(-1)).toContain('pnpm next-spec')
  await must(ui, /→ Mark incomplete until the check comes back$/, 'Button')
  await must(ui, /^sent$/)
  expect(await shows(ui, /answers? ready/)).toBe(false)
  await ui.unmount()
})

test("v2 shows what the answers changed, its new question, and Cedar Ridge's changed outcome to confirm", async ($, on) => {
  const p = project(V2.spec, V2.cases, ANSWERS.filter(a => a.spec_version === 1))
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await shows(ui, /answers? ready/)).toBe(false)                   // v1's answers don't ride along on v2
    await must(ui, /^A money services business has applied/)
    await must(ui, /^What your answers changed$/)
    await must(ui, /^Spec v2: 4 kinds of case change, 1 past case$/)
    await must(ui, /^▸ Cedar Ridge Payments, Inc\.: which/, 'Button')
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'q-EX-3' })
  await must(ui, /^Spec v1: Escalate   Spec v2: Approve$/)
  await ui.press({ key: 'p-EX-3-spec' })
  await must(ui, /^1 answer ready$/)
  await must(ui, /^Cedar Ridge Payments, Inc\. → Spec was right$/, 'Button')
  await must(ui, /^not sent yet$/)
  await ui.unmount()
})

test('v3 with nothing left to answer offers the approval, and an approved v3 says so', async ($, on) => {
  const unapproved = { ...copy(V3.spec), approved: false }
  const p = project(unapproved, V3.cases)
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await must(ui, /^Spec v3 has no open questions$/)
  await must(ui, /^Rules$/, 'Button')                                        // nothing counted, but not done until approved
  await ui.press({ key: 'approve-spec' })
  expect(p.filled.at(-1)).toContain('I approve spec v3')
  await must(ui, /^Approval of spec v3 sent/)
  await ui.unmount()

  p.files['.resolve/spec.json'] = JSON.stringify(V3.spec)                    // pnpm resolve recorded the approval
  await $.command.run({ command: 'resolve', args: '' } as never)
  const after = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await must(after, /^✓ Spec v3 approved$/)
  await after.press({ key: 'tab-process' })
  await must(after, /^Needs a look  \d+$/)
  await after.unmount()
})

test('the spec opens from the header, the coverage line and a finding, with each rule in plain words or as Z3 checks it', async ($, on) => {
  project(V1.spec, V1.cases).wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'spec-view' })                                       // the version in the header
    await must(ui, /^How the SOP became rules$/)
    await must(ui, /^spec v1 · 15 of 16 SOP sections covered · 14 rules$/)
    await must(ui, /^Licensed money services businesses whose state licence has been verified may be approved/)
    await must(ui, /^Not covered: no rule was written from this section\.$/)    // 3.1
    await must(ui, /^Covered by the spec itself/)                                // 2.1, 2.2
    expect(await shows(ui, /\(= licence_verified_c yes\)/)).toBe(false)
    await ui.press({ key: 'mode-z3' })                                           // the auditor's view: each rule's formula
    await must(ui, /^msb-licensed → approve$/)
    await ui.press({ key: 'mode-plain' })
    await ui.press({ key: 'back-queue' })
    await must(ui, /^Next$/)

    await ui.press({ key: 'toggle-sop' })                                        // the coverage line under the queue
    await must(ui, /^How the SOP became rules$/)
    await ui.press({ key: 'back-queue' })

    await ui.press({ key: 'refs-dead-msb-licensed' })                            // a finding's SOP sections
    await must(ui, /^An open question is about this section\.$/)
    await ui.press({ key: 'tab-process' })                                       // a stage closes the spec
    await must(ui, /^6 cases/)
    await ui.press({ key: 'tab-spec' })
    await must(ui, /^Next$/)
    await ui.unmount()
  }
})

test('v2 lists the answers it applied and says each change the right way round', async ($, on) => {
  const spec = copy(V2.spec) as { findings: { id: string; answer: unknown }[] }
  const p = project(spec, V2.cases)
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await must(ui, /^Your answers in it$/)
  await must(ui, /^✓ Yes, a verified licence skips the 5\.2 referral · applied in v2$/)
  await must(ui, /under v1 the case came out escalate \(5\.2\); under v2 it comes out approve \(5\.3\)\.$/)
  expect(await shows(ui, /now comes out/)).toBe(false)
  await ui.unmount()
})
