// Draws the trees tests/preview.test.tsx prints as HTML pages styled like the desktop pane, and screenshots each.
// An approximation of the desktop's renderer, for checking layout without the app: see README.md.
//   mod/resolve/preview/run.sh [out-dir] [dark|light]   (runs scenes.tsx, then this)
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const out = resolve(process.argv[2] ?? 'preview-out')
const theme = process.argv[3] ?? 'dark'
// The pane's width: 480 is the default dock; about 900 is a pane given two thirds of the window.
const width = Number(process.argv[4] ?? 480)
mkdirSync(out, { recursive: true })

const T = {
  dark: { bg: '#262624', fg: '#E8E6E1', dim: '#9A988F', line: 'rgba(255,255,255,0.14)', btn: '#3A3936', btnFg: '#E8E6E1', primary: '#E8E6E1', primaryFg: '#1F1E1D', code: '#1F1E1D' },
  light: { bg: '#FAF9F7', fg: '#1F1E1D', dim: '#6B6A65', line: 'rgba(31,30,29,0.12)', btn: '#EDEBE6', btnFg: '#1F1E1D', primary: '#1F1E1D', primaryFg: '#FFFFFF', code: '#F1EFE9' },
}[theme]
// Theme keys as the canvas maps them.
const COLOR = { warning: '#C7950F', success: '#2E9E5B', error: '#D0453A', claude: '#D77757', subtle: T.line, text: T.fg, inactive: T.dim, permission: '#7A8CFF' }
const SIZE = { caption: 11, footnote: 12, body: 13, heading: 15, title: 17 }
const space = v => (typeof v === 'number' ? v * 8 : { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }[v] ?? 0)
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const color = c => (c ? COLOR[c] ?? c : undefined)

function textStyle(p) {
  const s = []
  if (p.size) s.push(`font-size:${SIZE[p.size]}px`)
  if (p.weight === 'semibold') s.push('font-weight:600')
  if (p.weight === 'bold' || (p.bold && p.weight !== 'regular' && p.weight !== 'semibold')) s.push('font-weight:700')
  if (p.backgroundColor) s.push(`background:${color(p.backgroundColor)};padding:0 2px`)
  if (p.color) s.push(`color:${color(p.color)}`)
  else if (p.dimColor) s.push(`color:${T.dim}`)
  if (p.mono) s.push("font-family:ui-monospace,'SF Mono',Menlo,monospace")
  if (p.italic) s.push('font-style:italic')
  if (p.underline) s.push('text-decoration:underline')
  if (p.wrap && p.wrap !== 'wrap') s.push('white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;display:inline-block')
  return s.join(';')
}

function kids(n) {
  return (n.children ?? []).map(draw).join('')
}

function draw(n) {
  if (n == null || n === false) return ''
  if (typeof n === 'string' || typeof n === 'number') return esc(n)
  const p = n.props ?? {}
  switch (n.type) {
    case 'Box': {
      const s = ['display:flex', `flex-direction:${p.flexDirection ?? 'row'}`, 'min-width:0', 'box-sizing:border-box']
      if (p.flexDirection === undefined || p.flexDirection === 'row') s.push('align-items:baseline')
      if (p.gap !== undefined) s.push(`gap:${space(p.gap)}px`)
      if (p.flexWrap) s.push(`flex-wrap:${p.flexWrap}`)
      if (p.alignItems) s.push(`align-items:${p.alignItems}`)
      if (p.justifyContent) s.push(`justify-content:${p.justifyContent}`)
      if (p.flexGrow !== undefined) s.push(`flex-grow:${p.flexGrow}`)
      if (p.flexShrink !== undefined) s.push(`flex-shrink:${p.flexShrink}`)
      for (const k of ['width', 'minWidth', 'height', 'minHeight']) if (p[k] !== undefined) s.push(`${k.replace(/W|H/, c => '-' + c.toLowerCase())}:${typeof p[k] === 'number' ? p[k] + 'px' : p[k]}`)
      for (const [k, css] of [['padding', 'padding'], ['margin', 'margin']]) {
        if (p[k] !== undefined) s.push(`${css}:${space(p[k])}px`)
        if (p[`${k}X`] !== undefined) s.push(`${css}-left:${space(p[`${k}X`])}px;${css}-right:${space(p[`${k}X`])}px`)
        if (p[`${k}Y`] !== undefined) s.push(`${css}-top:${space(p[`${k}Y`])}px;${css}-bottom:${space(p[`${k}Y`])}px`)
        for (const side of ['Top', 'Bottom', 'Left', 'Right']) if (p[`${k}${side}`] !== undefined) s.push(`${css}-${side.toLowerCase()}:${space(p[`${k}${side}`])}px`)
      }
      // Desktop gives a bordered box about a line of room above and below its content, on top of any padding it is given.
      if (p.borderStyle) s.push(`border:1px solid ${color(p.borderColor) ?? T.line};border-radius:${p.borderStyle === 'round' ? 10 : 0}px;padding-top:calc(10px + ${space(p.paddingY ?? 0)}px);padding-bottom:calc(10px + ${space(p.paddingY ?? 0)}px)`)
      if (p.paddingX === undefined && p.borderStyle) s.push('padding-left:12px;padding-right:12px')
      if (p.backgroundColor) s.push(`background:${color(p.backgroundColor)}`)
      if (p.display === 'none') s.push('display:none')
      return `<div style="${s.join(';')}">${kids(n)}</div>`
    }
    case 'Text':
      return `<span style="${textStyle(p)}">${kids(n)}</span>`
    case 'Button': {
      const label = n.children?.length ? kids(n) : esc(p.label ?? '')
      const hot = p.hotkey ? `<span class="hot">${esc(p.hotkey)}</span>` : ''
      const cls = p.variant === 'primary' ? 'btn primary' : p.plain ? 'btn plain' : 'btn'
      return `<button class="${cls}${p.dimColor ? ' dim' : ''}" title="${esc(p.key ?? '')}">${label}${hot}</button>`
    }
    case 'Svg':
      return `<span style="display:inline-flex;width:${p.width ?? 14}px;height:${p.height ?? 14}px">${p.source}</span>`
    case 'Code':
      return `<pre class="code">${esc(p.source)}</pre>`
    case 'Markdown':
      return `<div>${esc(p.text)}</div>`
    case 'Link':
      return `<a>${kids(n)}</a>`
    default:
      return kids(n)
  }
}

const page = (name, body) => `<!doctype html><meta charset="utf-8"><title>${esc(name)}</title>
<style>
body{margin:0;background:${T.bg};color:${T.fg};font:13px/1.45 system-ui,-apple-system,'Segoe UI',sans-serif}
.pane{width:${width}px;padding:16px 18px;box-sizing:border-box;overflow:hidden;border-right:1px dashed #f0f}
.btn{font:inherit;color:${T.btnFg};background:${T.btn};border:none;border-radius:8px;padding:5px 12px;display:inline-block;text-align:left;white-space:normal;max-width:100%}
.hot{margin-left:8px}
.btn.plain{background:none;padding:2px 0}
.btn.dim{color:${T.dim}}
.btn.primary{background:${T.primary};color:${T.primaryFg};font-weight:600}
.hot{font-size:11px;border:1px solid ${T.line};border-radius:4px;padding:0 5px;color:${T.dim}}
.code{margin:0;padding:8px 10px;background:${T.code};border-radius:6px;font:12px/1.5 ui-monospace,'SF Mono',Menlo,monospace;white-space:pre-wrap}
</style><div class="pane">${body}</div>`

const input = readFileSync(0, 'utf8')
const scenes = input.split('\n').flatMap(l => {
  const i = l.indexOf('PREVIEW>>')
  return i < 0 ? [] : [JSON.parse(l.slice(i + 9))]
})
if (!scenes.length) {
  console.error('No PREVIEW>> lines on stdin. Run mod/resolve/preview/run.sh.')
  process.exit(1)
}
for (const s of scenes) writeFileSync(join(out, `${s.name}.html`), page(s.name, draw(s.tree)))

// Playwright: the repo's own if installed, else PLAYWRIGHT_PATH.
const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require(process.env.PLAYWRIGHT_PATH ?? 'playwright'))
} catch {
  console.log(`Wrote ${scenes.length} pages to ${out} (no Playwright found for screenshots; set PLAYWRIGHT_PATH).`)
  process.exit(0)
}
const browser = await chromium.launch()
const tab = await browser.newPage({ viewport: { width: width + 40, height: 900 }, deviceScaleFactor: 2 })
for (const s of scenes) {
  await tab.goto('file://' + join(out, `${s.name}.html`))
  // Anything wider than the pane is a layout bug: report it.
  const over = await tab.evaluate(() => {
    const pane = document.querySelector('.pane').getBoundingClientRect()
    return [...document.querySelectorAll('.pane *')].filter(el => el.getBoundingClientRect().right > pane.right + 0.5).map(el => (el.textContent ?? '').slice(0, 60))
  })
  await tab.locator('.pane').screenshot({ path: join(out, `${s.name}.png`) })
  console.log(`${s.name}.png${over.length ? `  ⚠ ${over.length} elements past the right edge, e.g. "${over[0]}"` : ''}`)
}
await browser.close()
