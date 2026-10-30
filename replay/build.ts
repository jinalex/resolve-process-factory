// Builds the replay page from a recorded run: pnpm build-replay [--check]
// Reads replay/steps.json and, for each step, the files pnpm resolve wrote (replay/recording/<step>/), and writes
// replay/index.html: one page with the recording inside, which calls no model and no solver. --check only compares it
// with the committed page. The page is published as a Claude Artifact; see replay/README.md.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../core/load.ts";

const DIR = join(ROOT, "replay");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

type Step = { dir: string; title: string; short: string; result: string; focus: string[]; by: string; commands: string[]; seconds?: number; runs?: string[]; text: string };
type Manifest = { title: string; sop: string; commit: string; recorded: string; model: string; steps: Step[] };

export function loadRecording() {
  const m: Manifest = JSON.parse(read("steps.json"));
  const steps = m.steps.map((s) => {
    const file = (f: string) => read(join("recording", s.dir, f));
    const { sop: _sop, rules: _rules, facts: _facts, ...spec } = JSON.parse(file("spec.json"));
    const cases = JSON.parse(file("cases.json"));
    // The page shows each case's outcomes and reasons, not its facts.
    for (const c of cases.cases) delete c.facts;
    let answers: unknown[] = [];
    try { answers = file("answers.jsonl").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)); } catch { /* none yet */ }
    return { ...s, spec, cases, status: JSON.parse(file("status.json")), answers };
  });
  const first = JSON.parse(read(join("recording", m.steps[0].dir, "spec.json")));
  const sop = Object.fromEntries(first.sop.map((p: { ref: string; text: string }) => [p.ref, p.text]));
  const display = JSON.parse(read("display.json"));
  return { manifest: m, steps, sop, sop_title: first.sop_title as string, display };
}

// 2026-10-29 -> 29 Oct 2026, the same in every time zone.
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildPage() {
  const r = loadRecording(), m = r.manifest;
  // JSON inside a script: "</" and the two line separators would end or break it.
  const data = JSON.stringify({ steps: r.steps, sop: r.sop, display: r.display }).replace(/<\//g, "<\\/").replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  return `<title>Resolve Recorded Run</title>
<meta name="claude:viewport-fit-sides" content="cover">
<!-- Built by replay/build.ts from replay/steps.json and replay/recording/. Edit those, or style.css and page.js, then run pnpm build-replay. -->
<style>
${read("style.css").trim()}
</style>
<div class="page">
  <header>
    <h1>${esc(m.title)}</h1>
    <p class="muted">Replay of a recorded run on ${esc(day(m.recorded))}, on a bank's Know Your Business (KYB) procedure, its SOP: the checks it runs before taking on a business customer. Nothing runs live here.</p>
  </header>
  <nav id="steps" aria-label="Steps"></nav>
  <main id="step" class="step"></main>
  <footer>
    <p>Every finding, question, option and outcome on this page is what Resolve and Claude wrote, reworded in plain language for this page (each card keeps the original under "As recorded"), on ${esc(m.recorded)}, from commit <code>${esc(m.commit.slice(0, 7))}</code>, on the ${esc(m.sop)}. Claude was ${esc(m.model)}. The case documents are made-up examples, and the owner's answers were written into the answers file by hand.</p>
    <p>Built from <code>replay/recording/</code> in the Resolve repository. Hover a section number, such as 5.3, to read that part of the procedure. The arrow keys step through the run.</p>
  </footer>
</div>
<script>window.REPLAY = ${data};</script>
<script>
${read("page.js").trim()}
</script>
`;
}

if (import.meta.main) {
  const page = buildPage(), out = join(DIR, "index.html");
  if (process.argv.includes("--check")) {
    let now = "";
    try { now = readFileSync(out, "utf8"); } catch { /* not built */ }
    if (now !== page) { console.error("replay/index.html is out of date; run pnpm build-replay."); process.exitCode = 1; }
    else console.log("replay/index.html is current.");
  } else {
    writeFileSync(out, page);
    console.log(`Wrote replay/index.html (${Math.round(page.length / 1024)} KB, ${loadRecording().steps.length} steps).`);
  }
}
