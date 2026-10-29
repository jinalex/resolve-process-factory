// What a recorded run cost, from its token counts.
import type { RunRecord } from "../runner/agent.ts";

// Per million tokens, Anthropic API list prices (October 2026). Cache writes are 1.25x input.
const PRICES: Record<string, { input: number; output: number; cache_read: number }> = {
  "claude-fable-5-1": { input: 10, output: 50, cache_read: 0.25 },
  "claude-opus-5-5": { input: 4, output: 20, cache_read: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_read: 0.2 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_read: 0.01 },
  none: { input: 0, output: 0, cache_read: 0 }, // Resolve alone: no model
};
export const dollars = (r: Pick<RunRecord, "model" | "usage">) => {
  // An unpriced model is an error, not $0. Fallback turns (served_by) are priced as the requested model, which
  // only matters when a fallback served some turns; the recorded runs say which model served each turn.
  const p = PRICES[r.model];
  if (!p) throw new Error(`No price for ${r.model}; add it to bench/prices.ts`);
  const u = r.usage;
  return (u.input * p.input + u.cache_write * p.input * 1.25 + u.cache_read * p.cache_read + u.output * p.output) / 1e6;
};
