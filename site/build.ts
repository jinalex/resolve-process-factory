// Builds the hosted page into site/dist/: pnpm build-site
// The lander (index.html, style.css), "Try it here" (app.ts bundled with the core it runs, and Z3's browser build),
// and the recorded tour (the replay page from replay/build.ts, in the site's look). Deployed to Cloudflare Pages
// with `wrangler pages deploy site/dist`; see site/README.md.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  for (const f of ["index.html", "tokens.css", "style.css", "favicon.svg", "_headers"]) copyFileSync(join(SITE, f), join(OUT, f));

  // The tour: the replay page, wrapped as a full document in the site's look.
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="../favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../tokens.css">`;
  const page = buildPage().replace("<title>", `${head}\n<title>`).replace(/<div class="page">/, `</head><body class="tour">
<nav class="top"><a href="../" class="wordmark">Resolve</a><a href="../#try">Try it here</a><a href="../#install">Install</a></nav>
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

if (import.meta.main) {
  await buildSite();
  console.log("Wrote site/dist/. Preview: npx wrangler pages dev site/dist   Deploy: npx wrangler pages deploy site/dist --project-name resolve");
}
