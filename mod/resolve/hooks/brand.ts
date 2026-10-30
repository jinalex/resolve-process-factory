// The Resolve brand's colours, light and dark: a copy of docs/brand/tokens.css, which is the source.
// docs/brand/tokens.test.ts fails if the two drift apart.
export const BRAND = {
  light: {
    ink: '#17202b', muted: '#5a6573', rule: '#d6dbe2', accent: '#ffe36e', accentInk: '#17202b', accentSoft: '#fff6c7',
    approve: '#24774a', request: '#b05e0d', escalate: '#6a40b2', decline: '#b3263a', incomplete: '#5a6573',
  },
  dark: {
    ink: '#e5e9ee', muted: '#9aa5b2', rule: '#2c333c', accent: '#e8c547', accentInk: '#17202b', accentSoft: '#2e2915',
    approve: '#6cc28b', request: '#e59b52', escalate: '#b89af0', decline: '#f07d8d', incomplete: '#9aa5b2',
  },
}

// The outcome colours the pane draws: halfway between the light and dark values, so a label reads on either background
// (the pane can't always tell the app's theme). Worked out from BRAND, so they move when tokens.css does.
const mix = (a: string, b: string) =>
  '#' + [1, 3, 5].map(i => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0')).join('')
const OUTCOMES = ['approve', 'request', 'escalate', 'decline', 'incomplete'] as const
export const TONE = Object.fromEntries(OUTCOMES.map(k => [k, mix(BRAND.light[k], BRAND.dark[k])])) as Record<(typeof OUTCOMES)[number], string>
