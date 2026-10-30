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
