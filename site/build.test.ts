// The hosted page's build: the recorded questions it shows still match the rules it reaches, and every file fits
// Cloudflare Pages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ROOT } from "../core/load.ts";
import { applyEdits } from "../core/spec-edit.ts";
import type { Spec } from "../core/spec.ts";
import { buildSite } from "./build.ts";

const json = (f: string) => JSON.parse(readFileSync(join(ROOT, f), "utf8"));
const run = (id: string) => json(`drafting/runs/options/${id}.json`);

describe("Try it here", () => {
  // The page shows Claude's recorded question for a finding only when the visitor's rules are exactly the rules
  // that run asked about. Taking the recorded owner's answers must reach version 2's rules, or round 2 has no question.
  it("the recorded answers to version 1 give version 2's rules", () => {
    const v1: Spec = json("spec/kyb-v1.json"), v2 = json("replay/recording/spec/kyb-v2.json");
    const chosen = [["kyb-v1-dead-msb-licensed-20261029T171620-0ff3b8", "Yes, a verified licence skips the 5.2 referral"],
                    ["kyb-v1-unknown-id-verified-20261029T171620-f884af", "Mark incomplete until the check comes back"]];
    const edits = chosen.flatMap(([id, option]) => run(id).parsed.options.find((o: { option: string }) => o.option === option).edits);
    const { spec, problems } = applyEdits(v1, edits);
    expect(problems).toEqual([]);
    expect(spec.rules).toEqual(v2.rules);
    expect(run("kyb-v2-unknown-industry-restricted-20261029T171824-dcae39").spec_file).toBe("spec/kyb-v2.json");
  });
});

describe("site/dist", () => {
  beforeAll(() => buildSite(), 60_000);
  const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]);

  it("has every file under Cloudflare Pages' 25 MiB limit", () => {
    for (const f of files(join(ROOT, "site/dist"))) expect(statSync(f).size, f).toBeLessThan(25 * 1024 * 1024);
  });
  it("splits Z3's wasm into parts that add back up to it", () => {
    const parts = ["0", "1"].map((i) => statSync(join(ROOT, `site/dist/z3/z3-built.wasm.${i}`)).size);
    expect(parts.reduce((a, b) => a + b)).toBe(statSync(join(ROOT, "node_modules/z3-solver/build/z3-built.wasm")).size);
  });
  it("sends the headers Z3's threads need", () => {
    const h = readFileSync(join(ROOT, "site/dist/_headers"), "utf8");
    expect(h).toContain("Cross-Origin-Opener-Policy: same-origin");
    expect(h).toContain("Cross-Origin-Embedder-Policy: require-corp");
  });
  it("spells out KYB where the lander and the tour first name it", () => {
    for (const f of ["index.html", "tour/index.html"]) {
      const text = readFileSync(join(ROOT, "site/dist", f), "utf8");
      expect(text.indexOf("Know Your Business (KYB)"), f).toBeGreaterThan(-1);
      expect(text.indexOf("Know Your Business (KYB)"), f).toBeLessThanOrEqual(text.indexOf("KYB"));
    }
  });
});
