import { expect, test } from 'claude-code/testing'
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
  const wire = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
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

test('every tab draws a real run from pnpm resolve, on every surface', async ($, on) => {
  project(SPEC).wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await has(ui, /3 of 3 findings on the rules need an answer/)).toBe(true)  // status.json's activity line
    expect(await has(ui, /Contradiction · SOP 5\.3/)).toBe(true)
    expect(await has(ui, /15 of 16 SOP paragraphs are covered/)).toBe(true)          // 2.1 and 2.2 are covered by the spec itself
    expect(await has(ui, /Not covered: 2\.1/)).toBe(false)
    expect(await has(ui, /No question written yet/)).toBe(true)
    expect(await has(ui, /Example: $/)).toBe(false)
    expect(await has(ui, /skill vnull|NaN/)).toBe(false)

    await ui.press({ key: 'tab-process' })
    expect(await has(ui, /^6 cases/)).toBe(true)
    await ui.press({ key: 'case-EX-2' })
    expect(await has(ui, /because 3\.3: Unless the entity is excluded/)).toBe(true)
    expect(await has(ui, /The rules give this outcome on the facts in the file/)).toBe(true)
    expect(await has(ui, /Unidentified holders/)).toBe(true)
    expect(await has(ui, /option pool|supports this outcome|Check passed/)).toBe(false)
    await ui.press({ key: 'back' })
    await ui.press({ key: 'case-EX-5' })
    expect(await has(ui, /For a person to check/)).toBe(true)
    expect(await has(ui, /Documents disagree on where Dariush Karimi lives/)).toBe(true)
    expect(await has(ui, /doesn't verify the evidence/)).toBe(true)
    await ui.press({ key: 'back' })
    await ui.press({ key: 'case-EX-1' })
    expect(await has(ui, /Priya Shah/)).toBe(true)                                   // Halcyon's owner, walked down from the company
    await ui.press({ key: 'back' })
    await ui.press({ key: 'tab-spec' })
    await ui.unmount()
  }
})

test('answers carry the spec version and the finding\'s rules, two quick presses both land, and old answers stay off', async ($, on) => {
  const spec = JSON.parse(JSON.stringify(SPEC))
  spec.findings[0] = { ...spec.findings[0], question: 'Should 5.3 win over 5.2?', options: ['Yes', 'No'] }
  spec.findings[1] = { ...spec.findings[1], question: 'Incomplete first?', options: ['Yes', 'No'] }
  const stale = JSON.stringify({ type: 'finding', id: spec.findings[1].id, rule_ids: spec.findings[1].rule_ids, choice: 'No', spec_version: 0, at: 'x' })
  const p = project(spec, { '.resolve/answers.jsonl': stale + '\n' })
  p.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  expect(await has(ui, /Answered: No/)).toBe(false)                                   // an answer to version 0 isn't shown on version 1
  await Promise.all([
    ui.press({ key: `f-${spec.findings[0].id}-Yes` }),
    ui.press({ key: `f-${spec.findings[1].id}-Yes` }),
  ])
  const lines = p.files['.resolve/answers.jsonl'].trim().split('\n').map(l => JSON.parse(l))
  expect(lines.length).toBe(3)
  expect(lines[1]).toMatchObject({ type: 'finding', id: spec.findings[0].id, rule_ids: spec.findings[0].rule_ids, choice: 'Yes', spec_version: 1 })
  expect(lines[2]).toMatchObject({ type: 'finding', id: spec.findings[1].id, choice: 'Yes', spec_version: 1 })
  expect(p.filled.at(-1)).toContain('Incomplete first?')
  await ui.unmount()
})
