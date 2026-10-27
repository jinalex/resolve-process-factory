// Exact fractions, so ownership shares never round. 33.33% of 40% is kept as 13332/1000000, not 0.13332.

export type Frac = { n: bigint; d: bigint };

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));

export function frac(n: bigint, d: bigint = 1n): Frac {
  if (d === 0n) throw new Error("fraction with zero denominator");
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

// A percentage as written ("33.33", 25, "12.5") becomes a fraction of one: 33.33 -> 3333/10000.
export function fromPercent(pct: number | string): Frac {
  const s = String(pct).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a percentage: ${s}`);
  const [whole, dec = ""] = s.split(".");
  return frac(BigInt(whole + dec), 100n * 10n ** BigInt(dec.length));
}

export const ZERO = frac(0n), ONE = frac(1n);
export const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const cmp = (a: Frac, b: Frac) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };

// For display only: the percentage, to two decimals.
export const toPercent = (a: Frac) => Number((a.n * 1000000n) / a.d) / 10000;
