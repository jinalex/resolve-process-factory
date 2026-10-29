import { expect, test } from 'claude-code/testing'
import { SPEC as spec, CASES as cases } from './real-run'

// What `pnpm resolve` writes at the repo root, copied here: the pane must draw a real run, not only its sample.
// See real-run.ts for how to regenerate it.
const PANE = {
  plugin: 'resolve', component: 'Pane', requestId: 'resolve',
  props: { title: 'Claude Resolve', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('every tab draws a real run from pnpm resolve, on every surface', async ($, on) => {
  const files: Record<string, string> = {
    '.resolve/spec.json': JSON.stringify(spec),
    '.resolve/cases.json': JSON.stringify(cases),
  }
  const rel = (e: unknown) => (e as { path: string }).path.replace(/^.*?(\.resolve\/)/, '$1')
  on('command.register', () => ({ value: { command: 'resolve' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('tool.register', () => ({ value: { tool: 'mcp__resolve__open_pane' } }))
  on('fs.exists', (_, e) => ({ value: rel(e) in files }))
  on('fs.read', (_, e) => ({ value: files[rel(e)] ?? '' }))
  on('fs.write', () => ({ value: undefined }))
  on('prompt.fill', () => ({ isFilled: true }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Contradiction · SOP 5\.3/ }))?.text).toBeTruthy()
    await ui.press({ key: 'tab-process' })
    await ui.press({ key: 'case-EX-2' })
    expect((await ui.find({ type: 'Text', text: /because 3\.3: Unless the entity is excluded/ }))?.text).toBeTruthy()
    await ui.press({ key: 'back' })
    await ui.press({ key: 'tab-spec' })
    await ui.unmount()
  }
})
