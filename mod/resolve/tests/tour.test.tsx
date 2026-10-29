import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'resolve', component: 'Pane', requestId: 'resolve',
  props: { title: 'Claude Resolve', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

// An engine with an empty project and the plugin's store, counting what the mod writes and fills.
function engine(store: Record<string, unknown> = {}) {
  const writes: string[] = []
  const filled: string[] = []
  const wire = (on: Parameters<TestBody>[1]) => {
    on('command.register', () => ({ value: { command: 'resolve' } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('clock.every', () => ({ value: undefined }))
    on('tool.register', () => ({ value: { tool: 'mcp__resolve__open_pane' } }))
    on('fs.exists', () => ({ value: false }))
    on('fs.read', () => ({ value: '' }))
    on('fs.write', (_, e) => {
      writes.push((e as { path: string }).path)
      return { value: undefined }
    })
    on('prompt.fill', (_, e) => {
      filled.push((e as { text: string }).text)
      return { isFilled: true }
    })
    on('store.get', (_, e) => ({ value: store[(e as { key: string }).key] }))
    on('store.set', (_, e) => {
      const { key, value } = e as { key: string; value: unknown }
      store[key] = value
      return { value: undefined }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
  }
  return { store, writes, filled, wire }
}

const must = async (ui: Parameters<typeof text>[0], re: RegExp) => {
  if (!(await text(ui, re))) throw new Error(`Nothing on screen matches ${re}`)
}
const text = async (ui: { find: (q: { type: 'Text'; text: RegExp }) => Promise<{ text: string } | undefined> }, re: RegExp) =>
  (await ui.find({ type: 'Text', text: re }))?.text

test('the first start opens the tour, and the owner clicks through the recorded run to the end, writing nothing', async ($, on) => {
  const x = engine()
  x.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(x.store.tour_seen).toBe(true)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    // The second time round, the tour starts from the header's button.
    if (surface === 'terminal') await ui.press({ key: 'tour' })

    await must(ui, /step 1 of 9/)
    await must(ui, /Welcome to Resolve/)
    await must(ui, /Cedar Ridge Payments/)
    await ui.press({ key: 'tour-next' })

    // 1. The SOP as rules
    await must(ui, /16 paragraphs · 14 rules/)
    await must(ui, /^5\.3 /)
    await ui.press({ key: 'tour-next' })

    // 2. The three questions, in plain words
    await must(ui, /5\.3 can never decide a case/)
    await must(ui, /Enhanced Due Diligence/)
    await ui.press({ key: 'tour-next' })

    // 3. Answer two: each option says what it would change before it is picked
    await must(ui, /Changes Cedar Ridge Payments, Inc\./)
    await must(ui, /Keeps the rules as they are/)
    expect(await ui.find({ type: 'Button', text: /Answer both to send \(0 of 2\)/ })).toBeTruthy()
    await ui.press({ key: 'f-dead-msb-licensed-No, refer every money services business to EDD' })
    await must(ui, /would keep the rules as they are/)
    await ui.press({ key: 'f-dead-msb-licensed-Yes, a verified licence skips the 5.2 referral' })
    await ui.press({ key: 'f-unknown-id-verified-Mark incomplete until the check comes back' })
    await ui.press({ key: 'tour-send' })
    await must(ui, /Sent\. Resolve wrote version 2/)
    await ui.press({ key: 'tour-next' })

    // 4. Version 2: Cedar Ridge flips, and one new question
    await must(ui, /from 2 answers/)
    await must(ui, /^v1: Escalate/)
    await must(ui, /no one has yet established whether its state licence is verified/)
    await ui.press({ key: 'tour-next' })

    // 5. Answer the follow-up, then approve version 3
    await ui.press({ key: 'f-unknown-industry-restricted-No, finish the licence check first' })
    await must(ui, /no open questions/)
    await ui.press({ key: 'tour-approve' })
    await must(ui, /Version 3 approved/)
    await ui.press({ key: 'tour-next' })

    // 6 and 7. The cases under version 3, and Cedar Ridge's record
    expect(await ui.find({ type: 'Button', text: /Cedar Ridge Payments, Inc\..*outcome doesn't follow/ })).toBeTruthy()
    await ui.press({ key: 'case-EX-3' })
    await must(ui, /A case record/)
    await must(ui, /The file says escalate, but the spec gives approve/)
    await must(ui, /^Licence verified/)
    await ui.press({ key: 'back' })
    await must(ui, /Your cases under version 3/)
    await ui.press({ key: 'case-EX-2' })
    await must(ui, /Bluefin Logistics LLC/)
    await must(ui, /unaccounted for/)
    await ui.press({ key: 'tour-next' })

    // 8. The end
    await must(ui, /step 9 of 9/)
    await must(ui, /pnpm resolve/)
    await ui.press({ key: 'tour-done' })
    await must(ui, /Questions for the expert/)
    await ui.unmount()
  }

  expect(x.writes).toEqual([])
  expect(x.filled).toEqual([])
})

test('a later start opens the pane, not the tour, and Skip leaves it', async ($, on) => {
  const x = engine({ tour_seen: true })
  x.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await must(ui, /Questions for the expert/)
  await ui.press({ key: 'tour' })
  await must(ui, /step 1 of 9/)
  await ui.press({ key: 'tour-exit' })
  await must(ui, /Questions for the expert/)
  await ui.unmount()
})

test('/resolve tour opens the tour', async ($, on) => {
  const x = engine({ tour_seen: true })
  x.wire(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const r = await $.command.run({ command: 'resolve', args: 'tour' } as never)
  expect(JSON.stringify(r)).toContain('tour is open')
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await must(ui, /step 1 of 9/)
  await ui.unmount()
})
