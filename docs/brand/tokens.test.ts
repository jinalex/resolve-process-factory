import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAND, TONE } from '../../mod/resolve/hooks/brand'

// The pane can't load CSS, so mod/resolve/hooks/brand.ts copies the colours from tokens.css. Same values, both themes.
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const read = (block: string) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]!.toLowerCase()]))
// A block by its selector; one that isn't there fails, rather than reading as no colours.
const block = (head: string) => {
  const at = css.indexOf(head)
  if (at < 0) throw new Error(`tokens.css has no ${head} block`)
  return read(css.slice(at, css.indexOf('}', at + head.length)))
}
const light = block(':root {')
const dark = block(':root[data-theme="dark"]')
// The system's dark mode repeats the dark tokens in a media query; it must say the same.
const systemDark = block('@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {')
const NAME: Record<string, string> = {
  ink: 'ink', muted: 'muted', rule: 'rule', accent: 'accent', accentInk: 'accent-ink', accentSoft: 'accent-soft',
  approve: 'approve', request: 'request', escalate: 'escalate', decline: 'decline', incomplete: 'incomplete',
}

describe("the pane's copy of the brand colours", () => {
  it('copies every colour it has, under a name tokens.css has', () => {
    for (const side of ['light', 'dark'] as const) expect(Object.keys(BRAND[side]).sort()).toEqual(Object.keys(NAME).sort())
  })
  it("tokens.css's two dark blocks agree", () => {
    expect(systemDark).toEqual(dark)
  })
  it('draws each outcome halfway between its light and dark colour', () => {
    for (const k of ['approve', 'request', 'escalate', 'decline', 'incomplete'] as const)
      for (const i of [1, 3, 5]) {
        const [a, b, t] = [BRAND.light[k], BRAND.dark[k], TONE[k]].map(c => parseInt(c.slice(i, i + 2), 16))
        expect(Math.abs(t! - (a! + b!) / 2)).toBeLessThanOrEqual(0.5)
      }
  })
  for (const [side, tokens] of [['light', light], ['dark', dark]] as const)
    it(`matches tokens.css (${side})`, () => {
      for (const [key, css] of Object.entries(NAME)) expect([key, BRAND[side][key as keyof typeof BRAND.light]]).toEqual([key, tokens[css]])
    })
})
