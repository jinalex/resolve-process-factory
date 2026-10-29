import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'resolve',
  component: 'Pane',
  requestId: 'resolve',
  props: {
    title: 'Claude Resolve',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('every tab draws the sample run, on every surface', async ($, on) => {
  const files: Record<string, string> = {}
  const filled: string[] = []
  // The engine hands hooks absolute paths; key the fake disk by the part under the project.
  const rel = (e: unknown) => (e as { path: string }).path.replace(/^.*?(\.resolve\/)/, '$1')
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

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Questions for the expert/ }))?.text).toBeTruthy()
    // The sample follows the current decisions: the pending-ID plant, and reasons, not a confidence cutoff.
    expect((await ui.find({ type: 'Text', text: /A slow ID check/ }))?.text).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /escalation can hide a decline|90%/ })).toBeUndefined()

    await ui.press({ key: 'tab-process' })
    expect((await ui.find({ type: 'Text', text: /cases with skill v3/ }))?.text).toBeTruthy()
    await ui.press({ key: 'case-C-2001' })
    expect((await ui.find({ type: 'Text', text: /Still missing/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /owners unknown/ }))?.text).toBeTruthy()
    await ui.press({ key: 'back' })

    await ui.press({ key: 'tab-improve' })
    expect((await ui.find({ type: 'Text', text: /Still failing/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /correct/ }))?.text).toBeTruthy()

    await ui.press({ key: 'tab-spec' })
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // A press marks the answer ready; nothing goes to Claude until the send bar sends the batch.
  await ui.press({ key: 'f-msb-licence-Yes, 5.3 wins' })
  expect(files['.resolve/answers.jsonl']).toContain('"id":"msb-licence"')
  expect(filled).toEqual([])
  expect((await ui.find({ type: 'Text', text: /Your answer: Yes, 5\.3 wins · not sent yet/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /1 answer ready/ }))?.text).toBeTruthy()
  await ui.press({ key: 'send' })
  expect(files['.resolve/answers.jsonl']).toContain('"type":"send","ids":["msb-licence"]')
  expect(filled.at(-1)).toContain('"Should a licensed MSB with a verified licence be approved?": Yes, 5.3 wins')
  expect(filled.at(-1)).toContain('pnpm next-spec')
  expect((await ui.find({ type: 'Text', text: /Sent: Yes, 5\.3 wins/ }))?.text).toBeTruthy()   // sent, not yet in a spec version
  await ui.unmount()
})
