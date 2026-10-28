// Expense claims: the raw claim, and how it becomes a case the general evaluator can run. The claim's lines
// become the "lines" list; the total, how late the claim was submitted, and each line's amount band are
// computed here. The rules, Z3 checks and evidence checks are the same core code KYB uses.
import type { Case, Value } from "../../core/evaluate.ts";

export type Line = { date?: string | null; category?: string; cabin?: string; amount_usd?: number | null;
                     itemised_receipt?: Value; recipient_official?: Value; pre_approved?: Value; description?: string };
export type Claim = {
  claimant: string;
  approver?: string | null;      // null or missing: nobody has recorded who approved it
  submitted: string;
  director_signed?: Value;
  lines?: Line[] | null;
};

// A calendar date written YYYY-MM-DD, as a day number. Anything else ("08/10/2026", "2026-02-31", "unknown") is null:
// the date is unknown, never guessed.
export function day(s: unknown): number | null {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== s ? null : ms / 86_400_000;
}
// An amount in dollars: a finite number, zero or more. Anything else is unknown.
export const dollars = (a: unknown): a is number => typeof a === "number" && Number.isFinite(a) && a >= 0;
// Read as unknown: missing, null, blank or "unknown". Anything else is a value someone recorded.
const given = (v: unknown): v is string => typeof v === "string" && v.trim() !== "" && v.trim().toLowerCase() !== "unknown";
const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
const known = <T>(xs: (T | null | undefined)[]): xs is T[] => xs.every((x) => x !== null && x !== undefined);

export function toCase(c: Claim): Case {
  const lines = c.lines ?? [];
  const amounts = lines.map((l) => (dollars(l.amount_usd) ? l.amount_usd : null)), dates = lines.map((l) => day(l.date)), submitted = day(c.submitted);
  return {
    // Self-approval is known only when both people are: an unknown claimant might be the approver.
    facts: { self_approved: given(c.approver) && given(c.claimant) ? sameName(c.approver, c.claimant) : undefined, director_signed: c.director_signed },
    items: {
      lines: lines.map((l, i) => ({
        name: l.description ?? `line ${i + 1}`, category: l.category, cabin: l.cabin,
        amount_band: amounts[i] === null ? undefined : amounts[i]! >= 75 ? "75_or_more" : "under_75",
        itemised_receipt: l.itemised_receipt, recipient_official: l.recipient_official, pre_approved: l.pre_approved,
      })),
    },
    computed: {
      // Cents, so the total is exact.
      total_usd: lines.length && known(amounts) ? amounts.reduce((t, a) => t + Math.round(a * 100), 0) / 100 : null,
      days_to_submit: lines.length && known(dates) && submitted !== null ? submitted - Math.min(...dates) : null,
    },
  };
}
