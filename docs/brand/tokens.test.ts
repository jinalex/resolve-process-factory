import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAND } from '../../mod/resolve/hooks/brand'

// The pane can't load CSS, so mod/resolve/hooks/brand.ts copies the colours from tokens.css. Same values, both themes.
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')
const read = (block: string) => Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]!.toLowerCase()]))
const light = read(css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {'))))
const dark = read(css.slice(css.indexOf(':root[data-theme="dark"]'), css.indexOf('}', css.indexOf(':root[data-theme="dark"]'))))
const NAME: Record<string, string> = {
  ink: 'ink', muted: 'muted', rule: 'rule', accent: 'accent', accentInk: 'accent-ink', accentSoft: 'accent-soft',
  approve: 'approve', request: 'request', escalate: 'escalate', decline: 'decline', incomplete: 'incomplete',
}

describe("the pane's copy of the brand colours", () => {
  for (const [side, tokens] of [['light', light], ['dark', dark]] as const)
    it(`matches tokens.css (${side})`, () => {
      for (const [key, css] of Object.entries(NAME)) expect([key, BRAND[side][key as keyof typeof BRAND.light]]).toEqual([key, tokens[css]])
    })
})
