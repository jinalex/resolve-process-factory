import { test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { ANSWERS, V1, V2, V3 } from '../hooks/tour-run'

// Not a check: preview/run.sh copies this into a scratch copy of the mod as a test, which prints the tree the pane
// draws for each scene; preview/render.mjs draws each as a page and screenshots it. See preview/README.md.

const PANE = {
  plugin: 'resolve', component: 'Pane', requestId: 'resolve',
  props: { title: 'Claude Resolve', isFocused: false, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const STATUS = (activity: string) => JSON.stringify({ stage: 2, state: 'needs_review', activity })
const copy = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const unasked = () => {
  const s = copy(V1.spec) as { findings: Record<string, unknown>[] }
  for (const f of s.findings) Object.assign(f, { question: null, options: [], option_edits: undefined, impact: undefined })
  return s
}
const lines = (xs: unknown[]) => xs.map(a => JSON.stringify(a)).join('\n') + '\n'

// Each scene: the files in .resolve/, then what the owner presses.
const SCENES: { name: string; files: Record<string, unknown>; press?: string[]; surface?: 'desktop' | 'terminal' }[] = [
  { name: '0-no-questions', files: { spec: unasked(), cases: V1.cases, status: STATUS('3 of 3 findings on the rules need an answer.') } },
  { name: '2-queue', files: { spec: V1.spec, cases: V1.cases, status: STATUS('3 of 3 findings on the rules need an answer.') } },
  { name: '2-why-details-logic', files: { spec: V1.spec, cases: V1.cases }, press: ['why-dead-msb-licensed', 'details-dead-msb-licensed', 'logic-dead-msb-licensed'] },
  { name: '2-answered', files: { spec: V1.spec, cases: V1.cases }, press: ['f-dead-msb-licensed-Yes, a verified licence skips the 5.2 referral'] },
  { name: '2-spec-view', files: { spec: V1.spec, cases: V1.cases }, press: ['refs-dead-msb-licensed'] },
  { name: '2-spec-z3', files: { spec: V1.spec, cases: V1.cases }, press: ['spec-view', 'mode-z3'] },
  { name: '5-v2', files: { spec: V2.spec, cases: V2.cases, answers: lines(ANSWERS.filter(a => a.spec_version === 1)), status: STATUS('1 of 1 finding on the rules need an answer.') } },
  { name: '6-approve', files: { spec: { ...copy(V3.spec), approved: false }, cases: V3.cases } },
  { name: '7-approved', files: { spec: V3.spec, cases: V3.cases } },
  { name: 'cases', files: { spec: V3.spec, cases: V3.cases }, press: ['tab-process'] },
  { name: 'case-EX-2', files: { spec: V3.spec, cases: V3.cases }, press: ['tab-process', 'case-EX-2'] },
]

for (const scene of SCENES) {
  test(`preview ${scene.name}`, async ($, on) => {
    const files: Record<string, string> = {}
    for (const [k, v] of Object.entries(scene.files)) files[`.resolve/${k === 'answers' ? 'answers.jsonl' : `${k}.json`}`] = typeof v === 'string' ? v : JSON.stringify(v)
    const rel = (e: unknown) => (e as { path: string }).path.replace(/^.*?(\.resolve\/)/, '$1')
    const wire = (o: Parameters<TestBody>[1]) => {
      o('command.register', () => ({ value: { command: 'resolve' } }))
      o('ui.open', () => ({ value: { isPlaced: true } }))
      o('clock.every', () => ({ value: undefined }))
      o('tool.register', () => ({ value: { tool: 'mcp__resolve__open_pane' } }))
      o('store.get', () => ({ value: true }))
      o('fs.exists', (_, e) => ({ value: rel(e) in files }))
      o('fs.read', (_, e) => ({ value: files[rel(e)] ?? '' }))
      o('fs.write', (_, e) => {
        files[rel(e)] = (e as { text: string }).text
        return { value: undefined }
      })
      o('prompt.fill', () => ({ isFilled: true }))
      o('session.start', (_, e) => ({ cwd: e.cwd }))
    }
    wire(on)
    const surface = scene.surface ?? 'desktop'
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })
    for (const key of scene.press ?? []) await ui.press({ key })
    console.log('PREVIEW>>' + JSON.stringify({ name: scene.name, surface, tree: await ui.drawn() }))
    await ui.unmount()
  })
}
