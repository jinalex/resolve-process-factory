// Reading an SOP's text: its numbered sections, and whether a rule's words are really the SOP's words. Used
// wherever a model writes a rule (drafting a spec, an option's edit), so every rule's text can be checked against
// the SOP it claims to come from.

// The SOP's numbered sections and their text: "3.3. Unless the entity ..." is section 3.3, with the lines it is
// wrapped over up to the next blank line, and the words under the heading "## 1. Purpose", before any numbered
// paragraph, are section 1 (one list item a line).
export function sections(sop: string): Map<string, string> {
  const out = new Map<string, string>();
  let top: string | null = null, ref: string | null = null;
  for (const line of sop.split("\n")) {
    const h = line.match(/^#+\s+(\d+)\.\s/), m = line.trim().match(/^(\d+\.\d+)\.\s+(.*)$/);
    if (h) { top = h[1]; ref = null; continue; }
    if (m) { ref = m[1]; out.set(ref, m[2]); top = null; continue; }
    if (!line.trim() || line.startsWith("#")) { ref = null; continue; }
    if (ref) out.set(ref, `${out.get(ref)} ${line.trim()}`);
    else if (top) out.set(top, `${out.get(top) ?? ""}\n${line.replace(/^\s*[-*]\s+/, "")}`.trim());
  }
  return out;
}

const norm = (s: string) => s.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
// A section's sentences: each line (a list item) on its own, split after ".", "!", "?" or ":" ("Approve: pay the
// claim." is two, so a quote may leave out an outcome's label).
const sentencesOf = (text: string) => text.split("\n").flatMap((line) => norm(line).split(/(?<=[.!?:])\s+/)).filter(Boolean);

// Is `quote` in the sections, word for word? A quote is whole sentences. " ... " joins runs of sentences that
// must appear in order; with several sections, each run is in one of them, and each section gives at least one.
// So a quote can't drop words from inside a sentence ("Alcohol is ... reimbursable.") or be only an ellipsis.
export function quoted(sections: string | string[], quote: string) {
  const secs = (Array.isArray(sections) ? sections : [sections]).map(sentencesOf);
  const pieces = quote.split(/\s*(?:\.\.\.|…)\s*/).map(norm).filter(Boolean);
  if (!pieces.length) return false;
  const from = secs.map(() => 0), used = secs.map(() => false);
  for (const piece of pieces) {
    const hit = secs.findIndex((ss, k) => {
      for (let i = from[k]; i < ss.length; i++) for (let j = i + 1; j <= ss.length; j++) {
        if (ss.slice(i, j).join(" ") === piece) { from[k] = j; return true; }
      }
      return false;
    });
    if (hit < 0) return false;
    used[hit] = true;
  }
  return used.every(Boolean);
}
