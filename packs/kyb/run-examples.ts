// Prints the outcome the reference spec gives for each example case: pnpm examples
import { kybSpec, loadExamples } from "./examples.ts";
import { evaluateKyb as evaluate } from "./facts.ts";

const spec = kybSpec();
for (const ex of loadExamples()) {
  const r = evaluate(spec, ex.facts);
  const why = r.decided_by.map((h) => (h.because ? `${h.sop} might apply (${h.because.join(", ")} unknown)` : h.sop)).join("; ");
  console.log(`${ex.case_id}  ${ex.name.padEnd(30)} ${r.outcome.padEnd(13)} ${why}`);
  for (const n of r.notes) console.log(`      note: ${n}`);
}
