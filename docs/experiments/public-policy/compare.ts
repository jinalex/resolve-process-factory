// Compares a policy's saved drafts with each other, case by case, with Z3 (up to one item in each list):
//   node docs/experiments/public-policy/compare.ts <policy>
// Writes <policy>/compare.json: for each pair, each change of outcome and an example case.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { assemble, parseReply } from "../../../drafting/draft-spec.ts";
import { diffSpecs } from "../../../core/sop-checks.ts";
import { shutdown } from "../../../core/z3.ts";

const dir = new URL(`./${process.argv[2]}/`, import.meta.url).pathname;
const skel = JSON.parse(readFileSync(dir + "skeleton.json", "utf8"));
const ids = readdirSync(dir + "runs").filter((f) => f.startsWith("draft-")).map((f) => f.replace(".json", "")).sort();
const specs = ids.map((f) => assemble(skel, parseReply(JSON.parse(readFileSync(`${dir}runs/${f}.json`, "utf8")).reply)));
const out: Record<string, unknown>[] = [];
for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
  const d = await diffSpecs(specs[i], specs[j], { slots: 1 });
  console.log(`${ids[i]} vs ${ids[j]}: ${d.length} kinds of disagreement${d.length ? `: ${d.map((c) => `${c.from}->${c.to}`).join(", ")}` : ""}`);
  out.push({ a: ids[i], b: ids[j], slots: 1, disagreements: d.map((c) => ({ a: c.from, b: c.to, example: c.example })) });
}
writeFileSync(dir + "compare.json", JSON.stringify(out, null, 2) + "\n");
await shutdown();
