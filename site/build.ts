// Builds the hosted page into site/dist/: pnpm build-site
// The lander (index.html, style.css), "Try it here" (app.ts bundled with the core it runs, and Z3's browser build),
// and the recorded tour (the replay page from replay/build.ts, in the site's look). Deployed to Cloudflare Pages
// with `wrangler pages deploy site/dist`; see site/README.md.
import { build } from "esbuild";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../core/load.ts";
import { buildPage } from "../replay/build.ts";

const SITE = join(ROOT, "site"), OUT = join(SITE, "dist");
// Cloudflare Pages takes files up to 25 MiB, and Z3's wasm is about 35 MB, so it goes up in two parts.
const PART = 20 * 1024 * 1024;

export async function buildSite() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "z3"), { recursive: true });
  mkdirSync(join(OUT, "fonts"), { recursive: true });
  mkdirSync(join(OUT, "tour"), { recursive: true });
  mkdirSync(join(OUT, "map"), { recursive: true });
  mkdirSync(join(OUT, "try"), { recursive: true });

  await build({
    entryPoints: [join(SITE, "app.ts")], bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true,
    outfile: join(OUT, "app.js"), loader: { ".md": "text" }, define: { global: "globalThis" }, logLevel: "warning",
    plugins: [{ name: "z3-browser", setup(b) { b.onResolve({ filter: /^z3-solver$/ }, () => ({ path: join(SITE, "z3-browser.ts") })); } }],
  });

  const z3 = join(ROOT, "node_modules/z3-solver/build");
  copyFileSync(join(z3, "z3-built.js"), join(OUT, "z3/z3-built.js"));
  const wasm = readFileSync(join(z3, "z3-built.wasm"));
  for (let i = 0; i * PART < wasm.length; i++) writeFileSync(join(OUT, `z3/z3-built.wasm.${i}`), wasm.subarray(i * PART, (i + 1) * PART));

  // The fonts are served from the site, because the page is cross-origin isolated (Z3 needs it) and so can't
  // load a stylesheet from another origin that doesn't opt in.
  const fonts = { "public-sans": ["400-normal", "400-italic", "500-normal", "600-normal", "800-normal"], "source-serif-4": ["400-normal", "600-normal"],
                  "ibm-plex-mono": ["400-normal", "500-normal"] };
  for (const [pkg, weights] of Object.entries(fonts)) for (const w of weights) {
    copyFileSync(join(ROOT, `node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}.woff2`), join(OUT, `fonts/${pkg}-${w}.woff2`));
  }

  for (const f of ["style.css", "hero.js", "_headers", "try/index.html"]) copyFileSync(join(SITE, f), join(OUT, f));
  writeFileSync(join(OUT, "index.html"), readFileSync(join(SITE, "index.html"), "utf8").replace("<!-- LADDER -->", ladderSection())
    .replace("<!-- HOW IT WORKS -->", howItWorks()));
  // The brand kit, with the site's fonts and one extra token after it.
  copyFileSync(join(ROOT, "docs/brand/favicon.svg"), join(OUT, "favicon.svg"));
  writeFileSync(join(OUT, "tokens.css"), `${readFileSync(join(ROOT, "docs/brand/tokens.css"), "utf8")}\n${readFileSync(join(SITE, "site-tokens.css"), "utf8")}`);

  // The tour: the replay page, wrapped as a full document in the site's look.
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../tokens.css">`;
  // The replay page brings its own viewport meta and Google Fonts links; the site serves its fonts itself (COEP).
  const replay = buildPage().replace(/<meta name="viewport"[^>]*>\n?/g, "").replace(/<link rel="preconnect"[^>]*>\n?/g, "")
    .replace(/<link rel="stylesheet"[^>]*fonts\.googleapis\.com[^>]*>\n?/g, "");
  if (replay.includes("fonts.googleapis.com")) throw new Error("replay/build.ts loads Google Fonts another way; serve them from the site instead.");
  const page = replay.replace("<title>", `${head}\n<title>`).replace(/<div class="page">/, `</head><body class="tour">
<nav class="top"><a href="../" class="wordmark">Resolve</a><a href="../try/">Try it</a><a href="../#install">Install</a><a href="../map/">System map</a></nav>
<div class="page">`);
  writeFileSync(join(OUT, "tour/index.html"), `${page}<style>${readFileSync(join(SITE, "tour-skin.css"), "utf8")}</style></body></html>\n`);

  // The system map (docs/architecture/index.html) as it is, made a full document, with its web fonts swapped for the
  // site's own (a cross-origin isolated page can't load Google's stylesheet).
  const map = readFileSync(join(ROOT, "docs/architecture/index.html"), "utf8")
    .replace(/<link rel="preconnect"[^>]*>\n?/g, "").replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, `<link rel="stylesheet" href="../tokens.css">`);
  if (map.includes("fonts.googleapis.com")) throw new Error("docs/architecture/index.html loads another Google Fonts stylesheet; serve it from the site instead.");
  writeFileSync(join(OUT, "map/index.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
${map}
<a href="../" style="position:fixed;top:12px;right:16px;font:600 14px var(--sans);color:var(--ink);background:var(--paper);border:1px solid var(--rule);padding:6px 10px;text-decoration:none">← Resolve</a>\n`);
}

// The system map's "How it works" (its two loops of steps), lifted onto the lander from docs/architecture/index.html so
// there is one copy. Its classes get an hw- prefix and its CSS is scoped to it, so neither clashes with the site's own.
const HW = ["flow", "loop", "between", "steps", "step", "ico", "arrow", "return", "cases", "eyebrow"];
export function howItWorks() {
  const map = readFileSync(join(ROOT, "docs/architecture/index.html"), "utf8");
  const html = map.match(/<section class="flow"[\s\S]*?<\/section>/)?.[0];
  const css = map.match(/\/\* How it works:[\s\S]*?(?=\n\.mapbox)/)?.[0];
  if (!html || !css) throw new Error("docs/architecture/index.html has no How it works section to lift onto the lander.");
  const cls = (s: string) => s.replace(/\.(flow|loop|between|steps|step|ico|arrow|return|cases|eyebrow)\b(?![-\w])/g, ".hw-$1");
  const eyebrow = map.match(/\n\.eyebrow \{[^}]*\}/)?.[0] ?? "";
  const body = html
    .replace(/class="([^"]*)"/g, (_, c: string) => `class="${c.split(" ").map((x) => HW.includes(x) ? `hw-${x}` : x).join(" ")}"`)
    .replace(/<h2 id="flow-h">How it works<\/h2>/, `<h2 id="flow-h">How it works</h2>`)
    .replace(/\s*<p>Not shown here:[\s\S]*?<\/p>/, "");
  return `<style>
.howto { --surface: var(--paper); --line: var(--rule); --accent: var(--ink); --proto: var(--approve); --body: var(--sans); }
${cls(eyebrow + "\n" + css)}
</style>
<div class="howto" id="how">${body.replace('class="hw-flow"', 'class="hw-flow sheet"')}</div>`;
}

// The bench's model ladder (bench/results/ladder.json), as a table: each model alone and with Resolve, on the same
// 60 cases. Left out until that file is on the branch.
type Rung = { model: string; effort: string; arm: "agentic" | "resolve"; runs: number; correct: number; dangerous_approvals: number;
              no_decision: number; unstable_cases: number; usd_per_case: number; s_per_case: number };
// "2026-10-30" as "30 Oct 2026", the way the rest of the site writes dates.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export function ladderSection() {
  const file = join(ROOT, "bench/results/ladder.json");
  if (!existsSync(file)) return "";
  const l: { cases: number; commit: string; generated: string; rungs: Rung[] } = JSON.parse(readFileSync(file, "utf8"));
  const name = (m: string) => m.replace(/^claude-/, "").replace(/-(\d+)-(\d+)$/, " $1.$2").replace(/^./, (c) => c.toUpperCase());
  const usd = (x: number) => `$${x < 0.01 ? x.toFixed(4) : x.toFixed(3)}`;
  // The comparison that matters first: the small model with Resolve, then the large one alone.
  const rank = (r: Rung) => r.arm === "resolve" ? (r.usd_per_case < 0.01 ? 0 : 3) : (r.usd_per_case < 0.01 ? 2 : 1);
  const rows = [...l.rungs].sort((a, b) => rank(a) - rank(b)).map((r) => {
    const pct = (100 * r.correct) / r.runs, full = r.correct === r.runs;
    return `<tr${r.arm === "resolve" ? ' class="with"' : ""}><td>${name(r.model)}, ${r.effort} effort, ${r.arm === "resolve" ? "<b>with Resolve</b>" : "alone"}</td>
      <td class="num"><span class="meter" style="--p:${pct.toFixed(1)}%"></span>${full ? `<mark>${r.correct}/${r.runs}</mark>` : `${r.correct}/${r.runs}`}</td>
      <td class="num">${r.dangerous_approvals}</td><td class="num">${usd(r.usd_per_case)}</td><td class="num">${r.s_per_case.toFixed(1)} s</td></tr>`;
  }).join("\n");
  return `<section id="bench" class="sheet">
  <h2>Haiku with Resolve got all 180 runs right; Opus alone got 153</h2>
  <p>Both arms use the same agent, tools and mocked evidence: ${l.cases} synthetic KYB cases, three runs each. Alone, the model reads the SOP and decides. With Resolve, the approved rules decide from what it gathered and name the facts it still has to get. A dangerous approval is approving a case the rules don't approve.</p>
  <div class="table-wrap"><table class="ladder">
    <tr><th>Agent</th><th class="num">Right outcome</th><th class="num">Dangerous approvals</th><th class="num">Cost per case</th><th class="num">Time per case</th></tr>
${rows}
  </table></div>
  <p class="note"><span class="rec" style="margin-left:0">Recorded ${day(l.generated)} · not live</span> Runs from commit <code>${l.commit}</code>, recorded in <code>bench/runs/</code>. The evidence is mocked, and the answer key is the approved rules, so "right" means agrees with the SOP owner's reading of the SOP.</p>
</section>`;
}

if (import.meta.main) {
  await buildSite();
  console.log("Wrote site/dist/. Preview: npx wrangler pages dev site/dist   Deploy: npx wrangler pages deploy site/dist --project-name resolve-process-factory --branch main (from outside the repo)");
}
