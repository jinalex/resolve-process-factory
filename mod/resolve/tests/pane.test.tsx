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
    if (surface === 'terminal') {
      // An empty project opens on what Resolve does and the one thing to do; the sample run is a press away.
      expect((await ui.find({ type: 'Text', text: /^No spec yet$/ }))?.text).toBeTruthy()
      await ui.press({ key: 'start' })
      expect(filled.at(-1)).toContain('pnpm propose-spec')
      filled.length = 0
      await ui.press({ key: 'show-sample' })
    }
    expect((await ui.find({ type: 'Text', text: /^Next$/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /^Should a licensed MSB with a verified licence be approved\?$/ }))?.text).toBeTruthy()
    // The sample follows the current decisions: the pending-ID plant, and reasons, not a confidence cutoff.
    expect(await ui.find({ type: 'Button', text: /^▸ A slow ID check/ })).toBeTruthy()   // up next, by its title
    if (surface === 'terminal') await ui.press({ key: 'why-msb-licence' })   // a toggle stays open across surfaces
    expect((await ui.find({ type: 'Text', text: /5\.2 escalates every MSB/ }))?.text).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /escalation can hide a decline|90%/ })).toBeUndefined()

    await ui.press({ key: 'tab-process' })
    expect((await ui.find({ type: 'Text', text: /cases with skill v3/ }))?.text).toBeTruthy()
    await ui.press({ key: 'case-C-2001' })
    expect((await ui.find({ type: 'Text', text: /Still missing/ }))?.text).toBeTruthy()
    const md = await (ui as unknown as { findAll: (q: object) => Promise<{ props?: { text?: string }; text?: string }[]> }).findAll({ type: 'Markdown' })
    expect(md.some(m => /owners unknown/.test(m.props?.text ?? m.text ?? ''))).toBe(true)   // in the ownership table
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
  expect(await ui.find({ type: 'Button', text: /→ Yes, 5\.3 wins$/ })).toBeTruthy()          // in Done, the next question on top
  expect((await ui.find({ type: 'Text', text: /^not sent yet$/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /1 answer ready/ }))?.text).toBeTruthy()
  await ui.press({ key: 'send' })
  expect(files['.resolve/answers.jsonl']).toContain('"type":"send","ids":["msb-licence"]')
  expect(filled.at(-1)).toContain('"Should a licensed MSB with a verified licence be approved?": Yes, 5.3 wins')
  expect(filled.at(-1)).toContain('pnpm next-spec')
  expect((await ui.find({ type: 'Text', text: /^sent$/ }))?.text).toBeTruthy()   // sent, not yet in a spec version
  await ui.unmount()
})
