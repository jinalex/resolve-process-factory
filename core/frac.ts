// Exact fractions, so ownership shares never round. 33.33% of 40% is kept as 3333/25000, not 0.13332.

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

// A number as written, exactly: 0.1 is 1/10, not the nearest binary fraction. JavaScript prints the shortest
// decimal that reads back as the same number, and Z3 reads that same decimal, so the two always agree.
export function fromNumber(x: number): Frac {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(x));
  if (!m) throw new Error(`not a finite number: ${x}`);
  const [, sign, whole, dec = "", exp = "0"] = m;
  const e = Number(exp) - dec.length;
  const n = BigInt(sign + whole + dec);
  return e >= 0 ? frac(n * 10n ** BigInt(e)) : frac(n, 10n ** BigInt(-e));
}

// A number in a case: a finite number, or an exact fraction written "p/q" (Z3 gives 1/3 that way, which no
// decimal can hold). Anything else is null, which the rules read as unknown.
export function fromValue(v: unknown): Frac | null {
  if (typeof v === "number") return Number.isFinite(v) ? fromNumber(v) : null;
  const m = typeof v === "string" ? /^(-?\d+)\/(\d+)$/.exec(v.trim()) : null;
  return m && BigInt(m[2]) !== 0n ? frac(BigInt(m[1]), BigInt(m[2])) : null;
}

export const ZERO = frac(0n), ONE = frac(1n);
export const add = (a: Frac, b: Frac) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac) => frac(a.n * b.n, a.d * b.d);
export const cmp = (a: Frac, b: Frac) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };

// For display only: the percentage, to four decimals (1/3 shows as 33.3333).
export const toPercent = (a: Frac) => Number((a.n * 1000000n) / a.d) / 10000;

// The exact percentage as "p/q", which fromValue, the evaluator and Z3 read without rounding (1/3 is "100/3").
export const exactPercent = (a: Frac) => { const f = frac(a.n * 100n, a.d); return `${f.n}/${f.d}`; };
