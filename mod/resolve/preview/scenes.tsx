import { test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { ANSWERS, V1, V2, V3 } from '../hooks/recorded-run'

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
// Stage 1: Claude has written the questions and options, but what each option changes isn't worked out yet.
const noImpacts = () => {
  const s = copy(V1.spec) as { findings: Record<string, unknown>[] }
  for (const f of s.findings) Object.assign(f, { impact: undefined })
  return s
}
// Cases in more than one group: two clean files and one escalation with nothing left to check.
const mixedCases = () => {
  const c = copy(V3.cases) as { cases: { id: string; missing: string[]; check?: { problems: string[]; flags?: string[]; outcome_follows?: boolean; passed: boolean } }[] }
  for (const x of c.cases.filter(x => ['EX-1', 'EX-4', 'EX-6'].includes(x.id))) {
    x.missing = []
    if (x.check) Object.assign(x.check, { problems: [], flags: [], outcome_follows: true, passed: true })
  }
  return c
}
const lines = (xs: unknown[]) => xs.map(a => JSON.stringify(a)).join('\n') + '\n'

// What pnpm improve writes for the two rounds run so far (bench/results/rounds.md).
const ROUNDS = {"accepted_version": 1, "rounds": [{"n": 1, "skill_version": 1, "passed": 60, "correct": 60, "total": 60, "got_worse": [], "groups": [], "back_to_spec": [], "skill_diff": [], "model": "claude-haiku-5-5", "effort": "low", "runs": 180, "usd_per_case": 0.001075729694444445, "turns_per_case": 4.066666666666666, "evidence_calls_per_case": 2.2222222222222223, "s_per_case": 6.313694444444445, "recommendation": {"accept": false, "text": "v1 is in use."}}, {"n": 2, "skill_version": 2, "passed": 60, "correct": 60, "total": 60, "got_worse": [], "groups": [], "back_to_spec": [], "skill_diff": [{"group": "Ask for evidence in two batched calls, and don't re-ask a fact that came back unknown.", "removed": [], "added": ["Gather in as few get_evidence calls as you can.", "First call: ownership, control_person, certification and every entity field, all at once.", "Second call: every field for every person those answers name, and ownership_of for every company that holds a share, all at once. Repeat only for companies the second call turns up.", "Then call check_with_resolve. Ask again only for the facts it lists as still needed, and don't ask again for a fact that came back unknown."]}], "model": "claude-haiku-5-5", "effort": "low", "runs": 180, "usd_per_case": 0.0011300482222222216, "turns_per_case": 4.133333333333334, "evidence_calls_per_case": 2.411111111111111, "s_per_case": 6.3372, "compared_to": 1, "recommendation": {"accept": false, "text": "Keep v1: no gain on any measure (a change under 10% is within rerun noise)."}}]}

// Each scene: the files in .resolve/, then what the owner presses.
const SCENES: { name: string; files: Record<string, unknown>; press?: string[]; surface?: 'desktop' | 'terminal' }[] = [
  { name: 'empty', files: {} },
  { name: 'checking', files: { status: JSON.stringify({ stage: 1, state: 'working', activity: 'Z3 is checking the rules against every combination of facts.', progress: [9, 14] }) } },
  { name: '0-no-questions', files: { spec: unasked(), cases: V1.cases, status: STATUS('3 of 3 findings on the rules need an answer.') } },
  { name: '1-questions', files: { spec: noImpacts(), cases: V1.cases, status: STATUS('3 of 3 findings on the rules need an answer.') } },
  { name: '2-queue', files: { spec: V1.spec, cases: V1.cases, status: STATUS('3 of 3 findings on the rules need an answer.') } },
  { name: '2-why-details-logic', files: { spec: V1.spec, cases: V1.cases }, press: ['why-dead-msb-licensed', 'details-dead-msb-licensed', 'logic-dead-msb-licensed'] },
  { name: '2-sop-open', files: { spec: V1.spec, cases: V1.cases }, press: ['sop-dead-msb-licensed'] },
  { name: '2-sop-why-open', files: { spec: V1.spec, cases: V1.cases }, press: ['sop-dead-msb-licensed', 'why-dead-msb-licensed'] },
  { name: '2-answered', files: { spec: V1.spec, cases: V1.cases }, press: ['f-dead-msb-licensed-Yes, a verified licence skips the 5.2 referral'] },
  { name: '2-spec-view', files: { spec: V1.spec, cases: V1.cases }, press: ['refs-dead-msb-licensed'] },
  { name: '2-spec-z3', files: { spec: V1.spec, cases: V1.cases }, press: ['spec-view', 'mode-z3'] },
  { name: '5-v2', files: { spec: V2.spec, cases: V2.cases, answers: lines(ANSWERS.filter(a => a.spec_version === 1)), status: STATUS('1 of 1 finding on the rules need an answer.') } },
  { name: '6-approve', files: { spec: { ...copy(V3.spec), approved: false }, cases: V3.cases } },
  { name: '7-approved', files: { spec: V3.spec, cases: V3.cases } },
  { name: 'cases', files: { spec: V3.spec, cases: V3.cases }, press: ['tab-process'] },
  { name: 'cases-mixed-open', files: { spec: V3.spec, cases: mixedCases() }, press: ['tab-process', 'case-EX-2'] },
  { name: 'case-file-open', files: { spec: V3.spec, cases: V3.cases }, press: ['tab-process', 'case-EX-1', 'toggle-facts'] },
  { name: 'case-EX-2', files: { spec: V3.spec, cases: V3.cases }, press: ['tab-process', 'case-EX-2'] },
  { name: 'rounds', files: { spec: V3.spec, cases: V3.cases, rounds: ROUNDS }, press: ['tab-improve'] },
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
