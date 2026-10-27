// Expense claims: the raw claim, and how it becomes a case the general evaluator can run. The claim's lines
// become the "lines" list; the total, how late the claim was submitted, and each line's amount band are
// computed here. The rules, Z3 checks and evidence checks are the same core code KYB uses.
import type { Case, Value } from "../../core/evaluate.ts";

export type Line = { date?: string | null; category?: string; cabin?: string; amount_usd?: number | null;
                     receipt?: Value; recipient_official?: Value; pre_approved?: Value; description?: string };
export type Claim = {
  claimant: string;
  approver?: string | null;      // null or missing: nobody has recorded who approved it
  submitted: string;
  director_signed?: Value;
  lines?: Line[] | null;
};

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const known = <T>(xs: (T | null | undefined)[]): xs is T[] => xs.every((x) => x !== null && x !== undefined);

export function toCase(c: Claim): Case {
  const lines = c.lines ?? [];
  const amounts = lines.map((l) => l.amount_usd), dates = lines.map((l) => l.date);
  return {
    facts: { self_approved: c.approver ? c.approver === c.claimant : undefined, director_signed: c.director_signed },
    items: {
      lines: lines.map((l, i) => ({
        name: l.description ?? `line ${i + 1}`, category: l.category, cabin: l.cabin ?? (l.category === "airfare" ? undefined : "none"),
        amount_band: typeof l.amount_usd === "number" ? (l.amount_usd >= 75 ? "75_or_more" : "under_75") : undefined,
        receipt: l.receipt, recipient_official: l.recipient_official ?? (l.category === "gift" ? undefined : "no"), pre_approved: l.pre_approved,
      })),
    },
    computed: {
      // Cents, so the total is exact.
      total_usd: lines.length && known(amounts) ? amounts.reduce((t, a) => t + Math.round(a * 100), 0) / 100 : null,
      days_to_submit: lines.length && known(dates) ? days(dates.reduce((a, b) => (a < b ? a : b)), c.submitted) : null,
    },
  };
}
