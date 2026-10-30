// Claude drafts a spec from the SOP; this file decides whether the draft holds up. A draft only proposes
// (principle 5): it never replaces the approved spec, and everything it gets wrong comes out as a problem, a
// Z3 finding or a case where it disagrees with the approved spec, for a person to settle.
//
// Claude is given the facts the pack can supply, the lists and the outcome names, and drafts every decision:
// the order, the rules, who a list's rules are about, the sums the spec adds up itself and the word maps.
import { createHash } from "node:crypto";
import type { Collection, ComputedDecl, Rule, Spec } from "../core/spec.ts";
import { validateSpec } from "../core/spec.ts";
import { checkSop, diffSpecs, type Finding } from "../core/sop-checks.ts";
import { quoted, sections } from "../core/sop-text.ts";

export { quoted, sections };

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
function given(spec: Spec) {
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
  const end = specTs.indexOf("// Problems that make a spec unusable");
  if (end < 0) throw new Error("core/spec.ts has no \"// Problems that make a spec unusable\" line to cut the format at.");
  return specTs.slice(0, end).trim();
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
    ...Object.entries(d.collections ?? {}).filter(([, c]) => c.counts_when || c.empty_ok_when || c.text).map(([k, c]) => ({ what: `Who counts in ${k}`, sop: c.sop, text: c.text })),
    ...(d.computed ?? []).map((c) => ({ what: `The sum for ${c.key}`, sop: c.sop, text: c.text })),
    ...(d.needs ?? []).map((n) => ({ what: `A sentence that needs a fact (${n.fact})`, sop: n.sop, text: n.text })),
  ];
  for (const q of quotes) {
    // A rule may cite several sections ("3.2, 3.3"); the quote must take sentences from each.
    const refs = (q.sop ?? "").split(/\s*,\s*/).filter(Boolean);
    const missing = refs.filter((s) => !secs.has(s));
    if (!refs.length) problems.push(`${q.what} names no SOP section.`);
    else if (missing.length) problems.push(`${q.what} cites ${missing.join(", ")}, which isn't a section of the SOP.`);
    else if (!q.text || !quoted(refs.map((s) => secs.get(s)!), q.text)) problems.push(`${q.what} quotes words that aren't in ${refs.join(", ")}: "${q.text ?? ""}"`);
  }
  const ids = new Set(d.rules.map((r) => r.id));
  const covered = new Map((d.sections ?? []).map((s) => [s.sop, s]));
  // A section is used when the order cites it, or a rule, the unknowns rule, a list, a sum or a need quotes it
  // (a quote takes sentences from every section it cites). Otherwise a note must say why it has no rule.
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

// The sections the draft gives no rule, only a note: nothing checks a note, so a person reads them.
function noteOnly(d: Draft, sop: string) {
  const cited = new Set([d.order_sop, d.unknowns?.sop, ...d.rules.map((r) => r.sop), ...Object.values(d.collections ?? {}).map((c) => c.sop),
                         ...(d.computed ?? []).map((c) => c.sop), ...(d.needs ?? []).map((n) => n.sop)].flatMap((s) => (s ?? "").split(/\s*,\s*/)));
  return (d.sections ?? []).filter((s) => sections(sop).has(s.sop) && !cited.has(s.sop) && s.note?.trim()).map((s) => ({ sop: s.sop, note: s.note! }));
}

export type Review = {
  problems: string[];                        // the draft can't be used as it is
  needs: NonNullable<Draft["needs"]>;        // sentences Claude couldn't express with the given facts
  findings: Pick<Finding, "id" | "kind" | "title" | "sop_refs">[];   // Z3's findings on the draft
  approved_findings: Pick<Finding, "id" | "kind" | "sop_refs">[];      // the approved spec's, to compare
  same_findings: boolean;                    // the same kinds of finding on the same SOP sections
  noted: { sop: string; note: string }[];    // sections with no rule, only a note: for a person to read
  disagreements: { approved: string; draft: string; example: unknown }[];  // cases the two specs decide differently
  word_maps: { fact: string; word: string; approved: string | null; draft: string | null }[]; // words the two read differently
  slots: number;                             // the comparison looked at cases with up to this many items in each list
  matches: boolean;                          // no problems, the same findings, the same outcome in every case it looked at, the same word maps
};

const SLOTS = 2;
// A finding as the SOP sees it: its kind and sections, not the draft's rule IDs.
const findingKey = (f: Pick<Finding, "kind" | "sop_refs">) => `${f.kind} ${[...f.sop_refs].sort().join(",")}`;
const sameFindings = (a: Pick<Finding, "kind" | "sop_refs">[], b: Pick<Finding, "kind" | "sop_refs">[]) =>
  a.map(findingKey).sort().join("|") === b.map(findingKey).sort().join("|");

// Every check on a draft. Z3 runs only once the draft loads; an unusable draft gets its problems and nothing else.
export async function review(approved: Spec, d: Draft, sop: string): Promise<Review> {
  const problems = draftProblems(approved, d, sop), needs = d.needs ?? [], slots = SLOTS;
  const noted = noteOnly(d, sop);
  const approved_findings = (await checkSop(approved)).map(({ id, kind, sop_refs }) => ({ id, kind, sop_refs }));
  if (problems.length) return { problems, needs, noted, findings: [], approved_findings, same_findings: false, disagreements: [], word_maps: [], slots, matches: false };
  const spec = assemble(approved, d);
  const findings = (await checkSop(spec)).map(({ id, kind, title, sop_refs }) => ({ id, kind, title, sop_refs }));
  const same_findings = sameFindings(findings, approved_findings);
  // Z3 compares the rules on the spec's own values; how each reads the case's words is compared word by word.
  const disagreements = (await diffSpecs(approved, { ...spec, maps: approved.maps }, { slots })).map((c) => ({ approved: c.from, draft: c.to, example: c.example }));
  const word_maps = wordMapDiffs(approved, spec);
  return { problems, needs, noted, findings, approved_findings, same_findings, disagreements, word_maps, slots,
           matches: same_findings && !disagreements.length && !word_maps.length };
}

// Words the approved spec and the draft read as different values. A word is read the way the evaluator reads it:
// through the spec's word map if it is there, otherwise as itself, which is unknown unless it is one of the fact's
// values. Case doesn't matter, so mapping "gift" to gift is no difference.
export function wordMapDiffs(a: Spec, b: Spec) {
  const out: Review["word_maps"] = [];
  for (const fact of [...new Set([...Object.keys(a.maps ?? {}), ...Object.keys(b.maps ?? {})])].sort()) {
    const values = a.facts.find((f) => f.key === fact)?.values ?? [];
    const read = (s: Spec, w: string) => { const v = s.maps?.[fact]?.[w] ?? w; return values.length && !values.includes(v) ? null : v; };
    for (const word of [...new Set([...Object.keys(a.maps?.[fact] ?? {}), ...Object.keys(b.maps?.[fact] ?? {})])].sort()) {
      const [p, q] = [read(a, word), read(b, word)];
      if (p !== q) out.push({ fact, word, approved: p, draft: q });
    }
  }
  return out;
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
