// Builds the replay page from a recorded run: pnpm build-replay [--check]
// Reads replay/steps.json and, for each step, the files pnpm resolve wrote (replay/recording/<step>/), and writes
// replay/index.html: one page with the recording inside, which calls no model and no solver. --check only compares it
// with the committed page. The page is published as a Claude Artifact; see replay/README.md.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "../core/load.ts";

const DIR = join(ROOT, "replay");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");

type Step = { dir: string; title: string; by: string; commands: string[]; seconds?: number; runs?: string[]; text: string };
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
  return { manifest: m, steps, sop, sop_title: first.sop_title as string };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function buildPage() {
  const r = loadRecording(), m = r.manifest;
  // JSON inside a script: "</" and the two line separators would end or break it.
  const data = JSON.stringify({ steps: r.steps, sop: r.sop }).replace(/<\//g, "<\\/").replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
  return `<title>Resolve Recorded Run</title>
<meta name="claude:viewport-fit-sides" content="cover">
<!-- Built by replay/build.ts from replay/steps.json and replay/recording/. Edit those, or style.css and page.js, then run pnpm build-replay. -->
<style>
${read("style.css").trim()}
</style>
<div class="page">
  <header>
    <span class="label">Resolve · recorded run</span>
    <h1>${esc(m.title)}</h1>
    <p>Resolve checks a written procedure with a solver, asks the policy owner about each problem it finds, and turns the answers into the next version of the rules. This page walks through one run of that loop, step by step, on a Know Your Business (KYB) procedure: the checks a bank runs before it takes on a business as a customer, such as finding out who owns and controls it and screening them against sanctions lists.</p>
    <p class="recorded"><strong>Recorded.</strong> Every finding, question, option and outcome below is what Resolve and Claude wrote on ${esc(m.recorded)}, from commit <code>${esc(m.commit.slice(0, 7))}</code>, on the ${esc(m.sop)}. Claude was ${esc(m.model)}. This page replays those files; it calls no model and no solver. The case documents are made-up examples. The owner's answers were written into the answers file by hand.</p>
  </header>
  <div class="layout">
    <nav id="steps" aria-label="Steps"></nav>
    <main id="step" class="step"></main>
  </div>
  <footer>
    <p>Built from <code>replay/recording/</code> in the Resolve repository. Hover a section number to read that SOP paragraph.</p>
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
