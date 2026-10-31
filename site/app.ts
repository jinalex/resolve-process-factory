// The hosted page's "Try it here": the Resolve core running in the browser, on the six KYB example cases.
// Nothing here decides anything. The Dafny-compiled evaluator gives each case's outcome, Z3 (in wasm) checks the
// spec, and the SOP owner's answers are applied with the core's own spec edits. The only recorded part is Claude's
// questions and options, from the run on 29 Oct 2026 (drafting/runs/options/), shown for the findings that run asked about.
import v1 from "../spec/kyb-v1.json";
import sop from "../sop/kyb_sop.md";
import ex1 from "../packs/kyb/cases/examples/northwind-coffee/truth.json";
import ex2 from "../packs/kyb/cases/examples/bluefin-logistics/truth.json";
import ex3 from "../packs/kyb/cases/examples/cedar-ridge-payments/truth.json";
import ex4 from "../packs/kyb/cases/examples/larkspur-health/truth.json";
import ex5 from "../packs/kyb/cases/examples/opal-trading/truth.json";
import ex6 from "../packs/kyb/cases/examples/sable-finch/truth.json";
import run1 from "../drafting/runs/options/kyb-v1-dead-msb-licensed-20261029T171620-0ff3b8.json";
import run2 from "../drafting/runs/options/kyb-v1-unknown-id-verified-20261029T171620-f884af.json";
import run3 from "../drafting/runs/options/kyb-v1-unused-licence_verified-20261029T171620-b2fe4a.json";
import run4 from "../drafting/runs/options/kyb-v2-unknown-industry-restricted-20261029T171824-dcae39.json";
import v2 from "../replay/recording/spec/kyb-v2.json";
import type { Spec } from "../core/spec.ts";
import type { Result } from "../core/evaluate.ts";
import { checkSop, deadRules, type Finding, unknownTriggers, unusedFacts } from "../core/sop-checks.ts";
import { optionImpact, type Impact, type OptionEdits, type PastCase } from "../core/impact.ts";
import { applyEdits } from "../core/spec-edit.ts";
import { sections } from "../core/sop-text.ts";
import { type KybFacts, evaluateKyb, toCase } from "../packs/kyb/facts.ts";
import { setProgress } from "./z3-browser.ts";

type Example = { case_id: string; name: string; facts: KybFacts };
type Recorded = { finding: string; rules: unknown; model: string; question: string; options: OptionEdits[] };
type Version = { n: number; spec: Spec; findings?: Finding[]; ms?: number; error?: string; checking?: boolean;
                 answers: Record<string, string>; impacts: Record<string, Impact | "running">; approved?: boolean };

const examples: Example[] = [ex1, ex2, ex3, ex4, ex5, ex6].map((t: any) => ({ case_id: t.case_id, name: t.name, facts: { review_date: t.review_date, ...t.true_facts } }));
const original = structuredClone(examples.map((e) => e.facts));
const sameRules = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Claude's question and options for a finding, when the 29 Oct run asked about this finding on these exact rules.
const recorded: Recorded[] = [run1, run2, run3, run4].map((r: any) => ({
  finding: r.finding, rules: (r.spec_file === "spec/kyb-v1.json" ? v1 : v2).rules, model: r.model, question: r.parsed.question, options: r.parsed.options,
}));
const recordedFor = (spec: Spec, f: Finding) => recorded.find((r) => r.finding === f.id && sameRules(r.rules, spec.rules));

const versions: Version[] = [{ n: 1, spec: v1 as unknown as Spec, answers: {}, impacts: {} }];
const current = () => versions.at(-1)!;
let open = examples[0].case_id;

const OUT: Record<string, [string, string]> = {
  approve: ["Approve", "o-approve"], incomplete: ["Incomplete", "o-incomplete"], request_docs: ["Request documents", "o-request"],
  escalate: ["Escalate", "o-escalate"], decline: ["Decline", "o-decline"],
};
const KIND: Record<string, string> = { gap: "Gap", contradiction: "Contradiction", unknowns: "Unknown facts", judgment: "Judgment call", uncovered: "Not covered" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const stamp = (o: string) => `<span class="stamp ${OUT[o]?.[1] ?? ""}">${esc(OUT[o]?.[0] ?? o)}</span>`;
// A section's words as the SOP has them (2.1, the order of outcomes, is in no rule's text).
const SECTIONS = sections(sop);
const sopText = (ref: string) => SECTIONS.get(ref) ?? "";
const words = (k: string) => k.replace(/_/g, " ");
const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

const past = (): PastCase[] => examples.map((e) => ({ id: e.case_id, name: e.name, decision: null, case: toCase(e.facts).case }));
const results = (spec: Spec) => new Map(examples.map((e) => [e.case_id, evaluateKyb(spec, e.facts)]));

// The facts a reader can change, with the values the spec gives them. Blank is unknown.
type Field = { label: string; get: (f: KybFacts) => unknown; set: (f: KybFacts, v: string | undefined) => void; values?: string[]; kind?: "date" | "text" | "pct" };
const factValues = (key: string) => (v1 as any).facts.find((f: any) => f.key === key)?.values as string[];
const entityFields: Field[] = [
  { label: "Industry", values: factValues("industry"), get: (f) => f.entity.industry, set: (f, v) => { f.entity.industry = v; } },
  { label: "State licence verified", values: factValues("licence_verified"), get: (f) => yn(f.entity.licence_verified), set: (f, v) => { f.entity.licence_verified = v; } },
  { label: "Country (ISO code)", kind: "text", get: (f) => f.entity.country, set: (f, v) => { f.entity.country = v; } },
  { label: "On the excluded list", values: ["yes", "no"], get: (f) => yn(f.entity.excluded), set: (f, v) => { f.entity.excluded = v; } },
  { label: "Nonprofit", values: ["yes", "no"], get: (f) => yn(f.entity.nonprofit), set: (f, v) => { f.entity.nonprofit = v; } },
  { label: "Entity sanctions screening", values: factValues("entity_sanctions"), get: (f) => f.entity.screening?.sanctions, set: (f, v) => { f.entity.screening = { ...f.entity.screening, sanctions: v }; } },
  { label: "Entity adverse media", values: factValues("entity_adverse_media"), get: (f) => f.entity.screening?.adverse_media, set: (f, v) => { f.entity.screening = { ...f.entity.screening, adverse_media: v }; } },
  { label: "Registry filing date", kind: "date", get: (f) => f.entity.registry_filed, set: (f, v) => { f.entity.registry_filed = v ?? null; } },
];
const yn = (v: unknown) => v === true ? "yes" : v === false ? "no" : v;
const personFields = ["id_verified", "sanctions", "pep", "adverse_media"].map((k): Field => ({
  label: ({ id_verified: "ID verified", sanctions: "Sanctions", pep: "Politically exposed", adverse_media: "Adverse media" } as Record<string, string>)[k], values: factValues(k),
  get: () => undefined, set: () => {},
}));

function select(id: string, value: unknown, values: string[]) {
  const v = value === undefined || value === null || value === "" ? "" : String(value);
  return `<select data-f="${id}"><option value=""${v === "" ? " selected" : ""}>unknown</option>${values.map((x) => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}${v && !values.includes(v) ? `<option selected>${esc(v)}</option>` : ""}</select>`;
}
function input(id: string, value: unknown, kind: string) {
  return `<input data-f="${id}" type="${kind === "date" ? "date" : kind === "pct" ? "number" : "text"}" ${kind === "pct" ? 'min="0" max="100" step="any"' : ""} value="${esc(value ?? "")}" placeholder="unknown">`;
}

function why(r: Result) {
  return r.decided_by.map((h) => h.because
    ? `<li><b>${esc(h.sop)}</b> might apply, and these facts are unknown: ${h.because.map((b) => `<mark>${esc(words(b))}</mark>`).join(", ")}. <q>${esc(h.text)}</q></li>`
    : `<li><b>${esc(h.sop)}</b> <q>${esc(h.text)}</q></li>`).join("");
}
// The facts the case still needs: every unknown behind a rule that might apply.
function missing(r: Result) {
  return [...new Set([...r.decided_by, ...r.might_apply].flatMap((h) => h.because ?? []))];
}

function renderCases(prev?: Map<string, Result>) {
  const spec = current().spec, res = results(spec);
  $("#cases").innerHTML = examples.map((e) => {
    const r = res.get(e.case_id)!, was = prev?.get(e.case_id), flipped = was && was.outcome !== r.outcome;
    const need = missing(r);
    return `<button class="case${e.case_id === open ? " open" : ""}" data-case="${e.case_id}">
      <span class="id">${e.case_id}</span><span class="nm">${flipped ? `<mark>${esc(e.name)}</mark>` : esc(e.name)}</span>
      ${flipped ? `<span class="was">was ${stamp(was!.outcome)}</span>` : ""}${stamp(r.outcome)}
      <span class="sub">${r.decided_by.map((h) => `§${esc(h.sop)}`).join(" ")}${need.length ? ` · missing: ${need.map(words).map(esc).join(", ")}` : ""}</span>
    </button>`;
  }).join("");
  renderCase(res.get(open)!);
}

function renderCase(r: Result) {
  const e = examples.find((x) => x.case_id === open)!, f = e.facts;
  const people = f.people ?? [];
  const pct = (h: any, path: string): string => `<li>${esc(h.name ?? "Unknown holder")} <span class="muted">(${esc(h.type)})</span> ${input(`own:${path}`, h.pct, "pct")}%
    ${h.owners?.length ? `<ul>${h.owners.map((o: any, i: number) => pct(o, `${path}.${i}`)).join("")}</ul>` : ""}</li>`;
  $("#case").innerHTML = `
    <div class="case-head"><span class="label">${e.case_id} · facts as gathered (mock evidence)</span><h4>${esc(e.name)}</h4>
      <div class="verdict">${stamp(r.outcome)}<ul class="why">${why(r)}</ul></div>
      ${r.notes.length ? `<p class="note">${r.notes.map(esc).join(" ")}</p>` : ""}
      <p class="note">Change any fact and the outcome is worked out again. Blank means unknown.</p></div>
    <div class="facts">
      <fieldset><legend>Business</legend>${entityFields.map((x, i) => `<label><span>${x.label}</span>${x.values ? select(`e:${i}`, x.get(f), x.values) : input(`e:${i}`, x.get(f), x.kind!)}</label>`).join("")}</fieldset>
      <fieldset><legend>Ownership</legend><ul class="own">${(f.ownership ?? []).map((h, i) => pct(h, String(i))).join("") || "<li>Nobody has established who owns it.</li>"}</ul>
        <p class="note">Control person: ${esc(f.control_person?.name ?? "not identified")}</p></fieldset>
      ${people.map((p, i) => `<fieldset><legend>${esc(p.name)}</legend>${personFields.map((x, j) => `<label><span>${x.label}</span>${select(`p:${i}:${j}`, yn((p as any)[["id_verified", "sanctions", "pep", "adverse_media"][j]]), x.values!)}</label>`).join("")}</fieldset>`).join("")}
    </div>
    <button class="quiet" data-reset>Put this case's facts back</button>`;
}

function setFact(id: string, raw: string) {
  const f = examples.find((x) => x.case_id === open)!.facts, v = raw.trim() === "" ? undefined : raw;
  const [kind, a, b] = id.split(":");
  if (kind === "e") entityFields[+a].set(f, v);
  if (kind === "p") (f.people![+a] as any)[["id_verified", "sanctions", "pep", "adverse_media"][+b]] = v;
  if (kind === "own") {
    let h: any = { owners: f.ownership };
    for (const i of a.split(".")) h = h.owners[+i];
    h.pct = v === undefined ? null : Number(v);
  }
}

// ---- The spec loop: Z3's findings, Claude's recorded questions, what each answer changes, the next version.

// Z3's three checks one at a time, so the page can say which it's on; then checkSop, which reuses their answers.
const CHECKS = [["rules that can never apply", deadRules], ["facts that never change an outcome", unusedFacts],
                ["rules that treat an unknown differently from SOP 2.2", unknownTriggers]] as const;
async function check(v: Version) {
  v.checking = true; renderLoop();
  const t = performance.now(), done: string[] = [];
  const say = (now: string) => { const p = document.getElementById("z3-progress"); if (p) p.innerHTML = [...done, now].map((l) => `<span>${esc(l)}</span>`).join(""); };
  try {
    for (const [name, run] of CHECKS) {
      const t1 = performance.now(), tick = setInterval(() => say(`Looking for ${name}… ${((performance.now() - t1) / 1000).toFixed(0)} s`), 500);
      say(`Looking for ${name}…`);
      const found = await run(v.spec).finally(() => clearInterval(tick));
      done.push(`Looked for ${name}: ${found.length} found, ${((performance.now() - t1) / 1000).toFixed(1)} s`);
    }
    v.findings = await checkSop(v.spec); v.ms = Math.round(performance.now() - t);
  } catch (e) { v.error = (e as Error).message; }
  v.checking = false; renderLoop();
}

async function impact(v: Version, f: Finding, o: OptionEdits) {
  const key = `${f.id}|${o.option}`;
  v.impacts[key] = "running"; renderLoop();
  v.impacts[key] = await optionImpact(v.spec, f, o, past(), sop);
  renderLoop();
}

function impactText(i: Impact | "running" | undefined) {
  if (!i) return "";
  if (i === "running") return `<p class="note">Z3 is working out what this answer changes…</p>`;
  if (i.problems.length) return `<p class="note">This option's edit can't be used: ${i.problems.map(esc).join(" ")}</p>`;
  if (i.keeps_rules) return `<p class="note">Keeps the rules as they are. No case changes.</p>`;
  return `<div class="effect">
    <p>${i.resolves ? "Settles this finding." : "Z3 still reports this finding."} ${i.flips.length ? `Example cases that change: ${i.flips.map((x) => `<mark>${esc(x.name)}</mark> ${stamp(x.from)} → ${stamp(x.to)}`).join(", ")}.` : "No example case changes."}</p>
    ${i.changes.length ? `<p class="note">Every kind of case that decides differently (${i.searched_items_per_list === null ? "all cases" : `cases with up to ${i.searched_items_per_list} people`}):</p><ul>${i.changes.map((c) => `<li>${stamp(c.from)} → ${stamp(c.to)} ${esc(c.example)}</li>`).join("")}</ul>` : ""}
    ${i.new_findings.length ? `<p>New question it opens: ${i.new_findings.map((n) => esc(n.title)).join("; ")}</p>` : ""}
    <p class="note">Worked out by Z3 in your browser in ${(i.ms / 1000).toFixed(1)} s.</p></div>`;
}

function renderLoop() {
  const v = current();
  const head = versions.map((x) => `<span class="ver${x === v ? " now" : ""}">Version ${x.n}${x.approved ? " · approved" : ""}</span>`).join("<span class=\"arrow\">→</span>");
  let body = "";
  if (!v.findings && !v.checking && !v.error) body = `<button class="primary" data-check>Check version ${v.n} with Z3</button>
    <p class="note">The first check downloads the solver (35 MB) and runs it in your browser. Version 1 takes about half a minute. Z3 checks every possible case. The one exception is lists it adds up, like ownership shares, which it checks up to a set number of owners.</p>`;
  if (v.checking) body = `<p class="progress" id="z3-progress">Starting Z3…</p>`;
  if (v.error) body = `<p class="note">Z3 couldn't run here: ${esc(v.error)} Try a recent Chrome, Edge, Firefox or Safari.</p>`;
  if (v.findings) {
    const asked = v.findings.map((f) => ({ f, r: recordedFor(v.spec, f) }));
    body = `<p>Z3 checked every possible case against version ${v.n} in ${(v.ms! / 1000).toFixed(1)} s and found ${v.findings.length === 0 ? "no problems" : v.findings.length === 1 ? "one problem" : `${v.findings.length} problems`}.</p>
    ${asked.map(({ f, r }) => `<article class="finding">
      <span class="label">${esc(KIND[f.kind] ?? f.kind)} · §${f.sop_refs.map(esc).join(", §")} · ${esc(f.proof.answer)}, ${f.proof.ms} ms</span>
      <h4>${esc(f.title)}</h4>
      <div class="sop">${f.sop_refs.map((s) => `<p><b>${esc(s)}</b> <mark>${esc(sopText(s))}</mark></p>`).join("")}</div>
      <p class="note">${esc(f.explain)}${f.example ? ` Example: ${esc(f.example)}` : ""}</p>
      ${r ? `<div class="margin"><b>Question for the SOP owner</b><span>${esc(r.question)}</span></div>
        <div class="opts">${r.options.map((o) => {
          const key = `${f.id}|${o.option}`, chosen = v.answers[f.id] === o.option;
          return `<div class="opt${chosen ? " chosen" : ""}"><div class="t"><span>${esc(o.option)}</span>${chosen ? `<span class="chosen-tag">Your answer</span>` : ""}</div>
            <span class="eff">${esc(o.says)}</span>
            <div class="row"><button class="quiet" data-impact="${esc(key)}">What would this change?</button><button class="quiet" data-answer="${esc(key)}">${chosen ? "Undo" : "Choose this"}</button></div>
            ${impactText(v.impacts[key])}</div>`;
        }).join("")}</div>
        <p class="note">Claude (${esc(r.model)}) wrote this question and its options on the recorded run of 29 Oct 2026, from Z3's finding. Each option carries the spec edit it means; what it would change is worked out live.</p>`
      : `<p class="note">The recorded run has no question for this finding, because your answers led to rules the recorded run never reached. In the mod, Claude writes the question here (<code>pnpm write-options</code>).</p>`}
    </article>`).join("")}
    ${v.findings.length === 0 ? (v.approved ? `<p>Version ${v.n} is approved. In the mod it becomes the rules every new case is decided by.</p>` : `<button class="primary" data-approve>Approve version ${v.n}</button>`) : ""}
    ${Object.keys(v.answers).length ? `<button class="primary" data-next>Write version ${v.n + 1} from ${Object.keys(v.answers).length === 1 ? "this answer" : "these answers"}</button>` : ""}`;
  }
  $("#loop").innerHTML = `<div class="versions">${head}</div>${body}${versions.length > 1 ? `<button class="quiet" data-restart>Start again from version 1</button>` : ""}`;
}

function nextVersion() {
  const v = current(), edits = v.findings!.flatMap((f) => recordedFor(v.spec, f)?.options.find((o) => o.option === v.answers[f.id])?.edits ?? []);
  const { spec, problems } = applyEdits(v.spec, edits);
  if (problems.length) { alert(problems.join("\n")); return; }
  const before = results(v.spec);
  versions.push({ n: v.n + 1, spec: { ...spec, version: v.n + 1 }, answers: {}, impacts: {} });
  renderCases(before);
  check(current());
}

export function start() {
  setProgress((got, total) => {
    const p = document.getElementById("z3-progress");
    if (p && got < total) p.textContent = `Downloading Z3: ${Math.round(got / 1048576)} of ${Math.round(total / 1048576)} MB`;
  });
  renderCases(); renderLoop();
  document.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest("button");
    if (!t) return;
    const v = current();
    if (t.dataset.case) { open = t.dataset.case; renderCases(); }
    if (t.hasAttribute("data-reset")) { const i = examples.findIndex((x) => x.case_id === open); examples[i].facts = structuredClone(original[i]); renderCases(); }
    if (t.hasAttribute("data-check")) check(v);
    if (t.dataset.impact || t.dataset.answer) {
      const [id, opt] = (t.dataset.impact ?? t.dataset.answer)!.split("|");
      const f = v.findings!.find((x) => x.id === id)!, o = recordedFor(v.spec, f)!.options.find((x) => x.option === opt)!;
      if (t.dataset.impact) impact(v, f, o);
      else { if (v.answers[id] === opt) delete v.answers[id]; else v.answers[id] = opt; renderLoop(); }
    }
    if (t.hasAttribute("data-next")) nextVersion();
    if (t.hasAttribute("data-approve")) { v.approved = true; renderLoop(); }
    if (t.hasAttribute("data-restart")) { versions.splice(1); Object.assign(versions[0], { answers: {}, impacts: {}, approved: false }); renderCases(); renderLoop(); }
  });
  document.addEventListener("change", (ev) => {
    const t = ev.target as HTMLInputElement;
    if (!t.dataset.f) return;
    setFact(t.dataset.f, t.value);
    renderCases();
  });
}

start();
