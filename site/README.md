# The hosted page

One page for reviewers: what Resolve is, **Try it here** (the core running in the browser, end to end), the tour (the
recorded run from `replay/`), how to install the mod, how to run it from a checkout, and what's real and what's made up.
It is deployed to Cloudflare Pages from the maintainer's machine; GitHub isn't connected to Cloudflare.

```
pnpm build-site                                                   # writes site/dist/
npx wrangler pages dev site/dist                                  # preview locally, with the headers in _headers
npx wrangler pages deploy site/dist --project-name resolve        # deploy (needs wrangler login)
```

- `index.html`, `style.css`: the lander. Its colours, type, wordmark, marks and stamps come from the brand kit in
  `docs/brand/` ("Markup": yellow only where a person has to look or decide); `site-tokens.css` adds the site's fonts
  and one extra token, and `build.ts` joins them into `dist/tokens.css`.
- `app.ts`: Try it here. The six KYB example cases go through the Dafny evaluator (`core/evaluate.ts`) as you change
  their facts; Z3 checks the spec (`core/sop-checks.ts`); each option's effect is `core/impact.ts`; the answers become the
  next version with `core/spec-edit.ts`. The only recorded part is Claude's question and options for each finding, from
  the run of 29 Oct 2026 in `runs/options/`, shown when the visitor's rules are exactly the rules that run asked about.
  Taking other answers reaches rules that run never saw, and the page says so instead of making up a question.
- `z3-browser.ts`: Z3's browser build, loaded on the first check. Its wasm is 35 MB, over Pages' 25 MiB per file, so
  `build.ts` splits it in two and this file joins it. Z3 runs on threads, which need a cross-origin isolated page:
  `_headers` sends the two headers, and so the fonts are served from the site rather than from a font CDN.
- `tour-skin.css`: the replay page in the site's look, by mapping its tokens onto the brand's.
- `build.ts`: bundles `app.ts` with esbuild and writes everything into `dist/` (gitignored).

Checking version 1 takes about 30 s in the browser, as it does in Node: the unknowns check covers cases with any number
of people. Each "What would this change?" takes about 6 s.
