import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ROOT } from "../core/load.ts";
import { buildPage, loadRecording } from "./build.ts";

describe("the replay page", () => {
  const r = loadRecording();

  test("the committed page is built from the recording as it is", () => {
    expect(readFileSync(join(ROOT, "replay/index.html"), "utf8")).toBe(buildPage());
  });

  test("every answer sent on the recorded run picks an option the owner was shown on that version", () => {
    const answers = r.steps.at(-1)!.answers as Record<string, any>[];
    const sent = answers.filter((a) => a.type === "send");
    expect(sent.length).toBeGreaterThan(0);
    for (const s of sent) {
      // The owner answers on the last step of a version, where each option's impact is shown.
      const asked = r.steps.filter((x) => x.spec.version === s.spec_version).at(-1)!;
      for (const id of s.ids) {
        const f = asked.spec.findings.find((x: any) => x.id === id);
        const a = answers.filter((x) => x.type === "finding" && x.id === id && x.spec_version === s.spec_version).at(-1)!;
        expect(f.option_edits.map((o: any) => o.option)).toContain(a.choice);
        const impact = f.impact.find((i: any) => i.option === a.choice);
        expect(impact.problems).toEqual([]);
        expect(a.rule_ids).toEqual(f.rule_ids);
      }
    }
  });

  test("the steps run in order: versions never go back, and the last one is approved", () => {
    const versions = r.steps.map((s) => s.spec.version);
    expect(versions).toEqual([...versions].sort((a, b) => a - b));
    expect(r.steps.at(-1)!.spec.approved).toBe(true);
    for (const s of r.steps) expect(s.spec.domain).toBe("kyb");
  });

  test("every step has a short name for the stepper and a one-line result to lead with", () => {
    for (const s of r.steps) {
      expect(s.short.length).toBeGreaterThan(0);
      expect(s.short.length).toBeLessThanOrEqual(14);
      expect(s.result).toMatch(/^[A-Z0-9].*\.$/);
    }
  });

  test("the page keeps a script-ending tag in the data from closing the script", () => {
    expect(buildPage().match(/<\/script>/g)?.length).toBe(2);
  });
});
