// Spike: how the unknowns check scales as one list gets more rules, with slots and with the quantified encoding.
//   node bench/quantified-probe.ts 0 2 4 8      KYB plus that many extra rules about people
// Each extra rule reads a new fact about each person, so KYB's people group needs one more slot per rule. With
// slots, the check caps at MAX_SLOTS.completes and says "up to N"; "slots=need" runs it uncapped, to show what
// covering every case with slots would cost. The quantified encoding covers every case at any size; "auto" uses slots
// where a group needs few and the quantified encoding past the cap.
import { forgetAnswers, slotsNeeded, sopCoverage, unknownTriggers } from "../core/sop-checks.ts";
import type { Spec } from "../core/spec.ts";
import { shutdown, z3Context } from "../core/z3.ts";
import { kybSpec } from "../packs/kyb/examples.ts";

const extra = process.argv.slice(2).map(Number);
const uncappedUpTo = Number(process.env.UNCAPPED_UP_TO ?? 8);
await z3Context();

function withPeopleRules(k: number): Spec {
  const s: Spec = structuredClone(kybSpec());
  for (let j = 0; j < k; j++) {
    s.facts.push({ key: `check_${j}`, per: "people", values: ["pass", "fail"] });
    s.rules.push({ id: `extra-${j}`, sop: `7.${j + 1}`, text: "", then: j % 2 ? "escalate" : "request_docs",
      when: { some: "people", where: { fact: `check_${j}`, is: "fail" } } });
  }
  return s;
}

async function time(spec: Spec, opts: Parameters<typeof unknownTriggers>[1]) {
  forgetAnswers();
  const t0 = performance.now();
  const fs = await unknownTriggers(spec, opts);
  return { s: ((performance.now() - t0) / 1000).toFixed(1), n: fs.length, ids: fs.map((f) => f.id).join(",") };
}

console.log("extra rules | rules | slots needed | slots (capped) s | covers | slots=need s | quantified s | auto s | covers | same findings");
for (const k of extra) {
  const spec = withPeopleRules(k);
  const need = slotsNeeded([spec], "completes");
  const capped = await time(spec, {});
  const full = need <= uncappedUpTo ? await time(spec, { slots: need }) : null;
  const quant = await time(spec, { encoding: "quantified" }), auto = await time(spec, { encoding: "auto" });
  const cov = (o: object) => { const u = sopCoverage(spec, o).find((c) => c.check === "unknowns")!.upTo; return u ? `up to ${u}` : "every case"; };
  console.log([k, spec.rules.length, need, capped.s, cov({}), full?.s ?? "skipped", quant.s, auto.s, cov({ encoding: "auto" }),
    capped.ids === quant.ids && auto.ids === quant.ids && (!full || full.ids === quant.ids) ? "yes" : `NO: ${capped.ids} | ${full?.ids} | ${quant.ids} | ${auto.ids}`].join(" | "));
}
await shutdown();
