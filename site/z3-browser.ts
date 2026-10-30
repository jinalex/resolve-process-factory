// What `z3-solver` resolves to in the hosted page's bundle (site/build.ts). The browser build of Z3 needs its
// script loaded as a classic script (it defines initZ3) and its 35 MB wasm, which is served in two parts because
// Cloudflare Pages takes files up to 25 MiB. Both load on the first check, not with the page.
import { init as initBrowser } from "../node_modules/z3-solver/build/browser.js";

export type { Context } from "z3-solver";

// Beside app.js, wherever the page that loads it lives.
const at = (f: string) => new URL(`z3/${f}`, import.meta.url).href;
const PARTS = [at("z3-built.wasm.0"), at("z3-built.wasm.1")];

// Called with how many bytes of the solver have arrived and how many there are, while it downloads.
export let onProgress: (got: number, total: number) => void = () => {};
export const setProgress = (f: typeof onProgress) => { onProgress = f; };

function loadScript(src: string) {
  return new Promise<void>((ok, fail) => {
    const s = document.createElement("script");
    s.src = src; s.onload = () => ok(); s.onerror = () => fail(new Error(`Couldn't load ${src}`));
    document.head.append(s);
  });
}

async function wasm(): Promise<ArrayBuffer> {
  const sizes = await Promise.all(PARTS.map(async (p) => Number((await fetch(p, { method: "HEAD" })).headers.get("content-length") ?? 0)));
  const total = sizes.reduce((a, b) => a + b, 0);
  let got = 0;
  const parts = await Promise.all(PARTS.map(async (p) => {
    const res = await fetch(p);
    if (!res.ok || !res.body) throw new Error(`Couldn't load ${p}`);
    const chunks: Uint8Array[] = [], reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onProgress(got, total);
    }
    return chunks;
  }));
  const all = parts.flat(), out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let pos = 0;
  for (const c of all) { out.set(c, pos); pos += c.length; }
  return out.buffer;
}

export async function init() {
  if (!crossOriginIsolated) throw new Error("This page isn't cross-origin isolated, so Z3 can't start its threads. The hosted site sends the headers for it (site/_headers).");
  const [, wasmBinary] = await Promise.all([loadScript(at("z3-built.js")), wasm()]);
  return initBrowser({ wasmBinary } as never);
}
