// Claude drafts a spec from the SOP; this file decides whether the draft holds up. A draft only proposes
// (principle 5): it never replaces the approved spec, and everything it gets wrong comes out as a problem, a
// Z3 finding or a case where it disagrees with the approved spec, for a person to settle.
//
// Claude is given the facts the pack can supply, the lists and the outcome names, and drafts every decision:
// the order, the rules, who a list's rules are about, the sums the spec adds up itself and the word maps.
import { createHash } from "node:crypto";
import type { Collection, ComputedDecl, Rule, Spec } from "./spec.ts";
import { validateSpec } from "./spec.ts";
import { checkSop, diffSpecs, type Finding } from "./sop-checks.ts";

// What Claude answers with: the decisions, plus where each SOP section went and what it couldn't express.
export type Draft = {
  order: string[];
  order_sop: string;
  unknowns: Spec["unknowns"];
  collections?: Record<string, Omit<Collection, "key" | "item">>;
  computed?: ComputedDecl[];
  maps?: Spec["maps"];
  rules: Rule[];
  sections: { sop: string; rules?: string[]; note?: string }[];
  needs?: { sop: string; text: string; fact: string }[];
};

// The parts of the approved spec Claude is given, not asked for: facts, lists, the computed facts the pack
// works out, and the lists' names. The approved spec's decisions are left out.
export function given(spec: Spec) {
  return {
    domain: spec.domain, version: spec.version, sop: spec.sop,
    facts: spec.facts,
    collections: spec.collections.map((c) => ({ key: c.key, item: c.item })),
    computed: spec.computed.filter((c) => !c.sum).map(({ key, values, numeric }) => ({ key, ...(values ? { values } : {}), ...(numeric ? { numeric } : {}) })),
    lists: spec.lists,
    ...(spec.list_sources ? { list_sources: spec.list_sources } : {}),
  };
}

// The rule format as Claude sees it: core/spec.ts up to the validator, so the prompt can't drift from the code.
export function formatDoc(specTs: string) {
  return specTs.slice(0, specTs.indexOf("// Problems that make a spec unusable")).trim();
}

export function buildPrompt(template: string, parts: { specTs: string; vocabulary: string; approved: Spec; sop: string }) {
  const fill: Record<string, string> = {
    FORMAT: formatDoc(parts.specTs),
    VOCABULARY: parts.vocabulary.replace(/^# .*\n+/, "").trim(),
    GIVEN: JSON.stringify(given(parts.approved), null, 2),
    OUTCOMES: [...parts.approved.order].sort().map((o) => `"${o}"`).join(", "),
    SOP: parts.sop.trim(),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (m, k: string) => fill[k] ?? m);
}

// The last ```json block in the reply. A reply with none, or with JSON that doesn't parse, is a problem, not a draft.
export function parseReply(reply: string): Draft {
  const blocks = [...reply.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  const body = blocks.length ? blocks[blocks.length - 1][1] : reply.trim();
  return JSON.parse(body) as Draft;
}

// The draft plus the given parts, as a spec. Given parts always come from the approved spec, so a draft can't
// change a fact's values or a list's contents.
export function assemble(approved: Spec, d: Draft): Spec {
  const g = given(approved);
  const extra = d.collections ?? {};
  return {
    ...g,
    order: d.order, order_sop: d.order_sop, unknowns: d.unknowns,
    collections: g.collections.map((c) => ({ ...c, ...(extra[c.key] ?? {}), key: c.key, item: c.item })),
    computed: [...g.computed, ...(d.computed ?? []).filter((c) => !g.computed.some((x) => x.key === c.key))],
    ...(d.maps && Object.keys(d.maps).length ? { maps: d.maps } : {}),
    rules: d.rules,
  };
}

// The SOP's numbered sections and their text: "3.3. Unless the entity ..." is section 3.3, and the words under
// the heading "## 1. Purpose", before any numbered paragraph, are section 1.
export function sections(sop: string): Map<string, string> {
  const out = new Map<string, string>();
  let top: string | null = null;
  for (const line of sop.split("\n")) {
    const h = line.match(/^#+\s+(\d+)\.\s/), m = line.match(/^(\d+\.\d+)\.\s+(.*)$/);
    if (h) { top = h[1]; continue; }
    if (m) { out.set(m[1], m[2]); top = null; continue; }
    if (top && line.trim()) out.set(top, `${out.get(top) ?? ""} ${line.replace(/^\s*[-*]\s+/, "")}`.trim());
  }
  return out;
}

const norm = (s: string) => s.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

// Is `quote` in the section, word for word? " ... " joins pieces that must appear in order.
export function quoted(section: string, quote: string) {
  const text = norm(section);
  let from = 0;
  for (const piece of quote.split(/\s*(?:\.\.\.|…)\s*/).map(norm).filter(Boolean)) {
    const at = text.indexOf(piece, from);
    if (at < 0) return false;
    from = at + piece.length;
  }
  return quote.trim().length > 0;
}

// Problems a person would have to fix before the draft can even be compared: it doesn't load, it quotes words the
// SOP doesn't have, it leaves a section out, or it declares something it was given.
export function draftProblems(approved: Spec, d: Draft, sop: string): string[] {
  const problems: string[] = [];
  const secs = sections(sop);
  const g = given(approved);
  for (const k of Object.keys(d.collections ?? {})) if (!g.collections.some((c) => c.key === k)) problems.push(`The draft describes a list it wasn't given: ${k}.`);
  for (const c of d.computed ?? []) {
    if (g.computed.some((x) => x.key === c.key)) problems.push(`The draft redefines ${c.key}, which the pack computes.`);
    else if (!c.sum) problems.push(`The draft adds a computed fact the pack doesn't supply: ${c.key}.`);
  }
  const quotes: { what: string; sop?: string; text?: string }[] = [
    { what: "The unknowns rule", sop: d.unknowns?.sop, text: d.unknowns?.text },
    ...d.rules.map((r) => ({ what: `Rule ${r.id}`, sop: r.sop, text: r.text })),
    ...Object.entries(d.collections ?? {}).filter(([, c]) => c.counts_when || c.text).map(([k, c]) => ({ what: `Who counts in ${k}`, sop: c.sop, text: c.text })),
    ...(d.computed ?? []).map((c) => ({ what: `The sum for ${c.key}`, sop: c.sop, text: c.text })),
  ];
  for (const q of quotes) {
    // A rule may cite several sections ("3.2, 3.3"); the quote must be in their text taken together.
    const refs = (q.sop ?? "").split(/\s*,\s*/).filter(Boolean);
    const missing = refs.filter((s) => !secs.has(s));
    if (!refs.length) problems.push(`${q.what} names no SOP section.`);
    else if (missing.length) problems.push(`${q.what} cites ${missing.join(", ")}, which isn't a section of the SOP.`);
    else if (!q.text || !quoted(refs.map((s) => secs.get(s)).join(" "), q.text)) problems.push(`${q.what} quotes words that aren't in ${refs.join(", ")}: "${q.text ?? ""}"`);
  }
  const ids = new Set(d.rules.map((r) => r.id));
  const covered = new Map((d.sections ?? []).map((s) => [s.sop, s]));
  // A section is used when a rule, the order, the unknowns rule, a list or a sum cites it.
  const cited = new Set([d.order_sop, ...quotes.map((q) => q.sop ?? "")].flatMap((s) => s.split(/\s*,\s*/)));
  for (const s of secs.keys()) {
    const c = covered.get(s), byRule = cited.has(s);
    if (!c && !byRule) problems.push(`Section ${s} isn't accounted for: no rule and no note.`);
    if (c && !byRule && !(c.rules ?? []).length && !c.note?.trim()) problems.push(`Section ${s} has neither a rule nor a note.`);
    for (const id of c?.rules ?? []) if (!ids.has(id)) problems.push(`Section ${s} lists a rule that isn't in the draft: ${id}.`);
  }
  if (!problems.length) problems.push(...validateSpec(assemble(approved, d)));
  return problems;
}

export type Review = {
  problems: string[];                        // the draft can't be used as it is
  needs: NonNullable<Draft["needs"]>;        // sentences Claude couldn't express with the given facts
  findings: Pick<Finding, "id" | "kind" | "title">[];   // Z3's findings on the draft
  approved_findings: string[];               // the approved spec's finding IDs, to compare
  disagreements: { approved: string; draft: string; example: unknown }[];  // cases the two specs decide differently
  matches: boolean;                          // no problems, and the same outcome as the approved spec in every case
};

// Every check on a draft. Z3 runs only once the draft loads; an unusable draft gets its problems and nothing else.
export async function review(approved: Spec, d: Draft, sop: string): Promise<Review> {
  const problems = draftProblems(approved, d, sop), needs = d.needs ?? [];
  const approved_findings = (await checkSop(approved)).map((f) => f.id);
  if (problems.length) return { problems, needs, findings: [], approved_findings, disagreements: [], matches: false };
  const spec = assemble(approved, d);
  const findings = (await checkSop(spec)).map(({ id, kind, title }) => ({ id, kind, title }));
  const disagreements = (await diffSpecs(approved, spec)).map((c) => ({ approved: c.from, draft: c.to, example: c.example }));
  return { problems, needs, findings, approved_findings, disagreements, matches: !disagreements.length };
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
