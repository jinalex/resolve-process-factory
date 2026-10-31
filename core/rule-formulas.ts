// Each rule's Z3 formula in readable form: when it applies, and when it certainly doesn't. Neither holding means
// it might apply, because a fact it needs is unknown. Used by show-z3 and by the pane's "Show the logic".
import type { Spec } from "./spec.ts";
import { Encoder, oneAtATime, z3Context } from "./z3.ts";

export type RuleFormula = { id: string; applies: string; certainly_not: string };
export type CountsFormula = { list: string; counts: string; certainly_not: string };

export const ruleFormulas = (spec: Spec, raw = false) => oneAtATime(() => formulasOf(spec, raw));
async function formulasOf(spec: Spec, raw: boolean): Promise<{ enc: Encoder; formulas: RuleFormula[]; counts: CountsFormula[] }> {
  const ctx = await z3Context();
  const enc = new Encoder(ctx, spec, 2);
  const s = enc.symCase("c");

  // "(= pep0_c 0)" -> "(= pep0_c yes)": each fact is a number standing for one of its values, last is unknown.
  const named = (x: string) => raw ? x : x.replace(/\(= ([a-z_]+?)(\d?)_c (\d+)\)/g, (m, key: string, slot: string, n: string) =>
    enc.dom[key] ? `(= ${key}${slot}_c ${enc.dom[key].labels[Number(n)]})` : m)
    // "not no and not unknown" is just "yes" when a fact has two values.
    .replace(/\(and \(not \(= ([a-z_]+?)(\d?)_c ([a-z_]+)\)\) \(not \(= \1\2_c unknown\)\)\)/g, (m, key: string, slot: string, v: string) => {
      const rest = enc.dom[key]?.labels.filter((x) => x !== v && x !== "unknown");
      return rest?.length === 1 ? `(= ${key}${slot}_c ${rest[0]})` : m;
    });
  const text = async (b: Parameters<typeof ctx.simplify>[0]) => named((await ctx.simplify(b)).sexpr()).replace(/\n\s*/g, " ");

  const formulas: RuleFormula[] = [];
  for (const r of spec.rules) {
    const { y, n } = enc.cond(r.when, s);
    formulas.push({ id: r.id, applies: await text(y), certainly_not: await text(n) });
  }
  // Who the rules are about, in a list with `counts_when` (KYB: the identified individuals), for its first item.
  const counts: CountsFormula[] = [];
  for (const c of spec.collections.filter((x) => x.counts_when)) {
    const { y, n } = enc.counts(c.key, s, 0);
    counts.push({ list: c.key, counts: await text(y), certainly_not: await text(n) });
  }
  return { enc, formulas, counts };
}
