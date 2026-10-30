import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { ROOT } from "../core/load.ts";
import { buildPage, loadRecording, parseAnswers } from "./build.ts";

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
      // Each focus names a part page.js draws (data-part), so the highlight can't silently point at nothing.
      expect(s.focus.length).toBeGreaterThan(0);
      for (const f of s.focus) expect(readFileSync(join(ROOT, "replay/page.js"), "utf8")).toContain(`data-part="${f}"`);
    }
  });

  test("the plain wording names only findings and options the recording has", () => {
    const found = new Map<string, any>();
    for (const s of r.steps) for (const f of s.spec.findings) if (f.option_edits) found.set(f.id, f);
    for (const [id, d] of Object.entries(r.display.findings) as [string, any][]) {
      expect(found.has(id)).toBe(true);
      expect(Object.keys(d.options).sort()).toEqual(found.get(id).option_edits.map((o: any) => o.option).sort());
    }
  });

  // Draws a step's HTML with page.js, as the page does, without a browser.
  const view = () => {
    const window: Record<string, any> = { REPLAY: JSON.parse(JSON.stringify({ steps: r.steps, sop: r.sop, display: r.display })) };
    runInNewContext(readFileSync(join(ROOT, "replay/page.js"), "utf8"), { window, document: { getElementById: () => null }, localStorage: { getItem: () => null } });
    return window.REPLAY_VIEW as { stepHtml: (i: number) => string };
  };

  test("a step shows no question, plain or recorded, before Claude has written it", () => {
    const v = view();
    r.steps.forEach((s, i) => {
      const html = v.stepHtml(i);
      for (const f of s.spec.findings) {
        const plain = (r.display.findings as any)[f.id]?.question;
        if (!f.question && plain) expect(html).not.toContain(plain.replace(/'/g, "&#39;"));
        if (f.question && plain) expect(html).toContain(plain.replace(/'/g, "&#39;"));
      }
    });
  });

  test("an example that says facts are \"as listed\" shows them", () => {
    const v = view();
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    let seen = 0;
    r.steps.forEach((s, i) => {
      const html = v.stepHtml(i);
      const changes = [...(s.spec.changes_from_previous ?? []), ...s.spec.findings.flatMap((f: any) => (f.impact ?? []).flatMap((x: any) => x.changes ?? []))];
      for (const c of changes) {
        if (!/as listed/.test(c.example) || !html.includes(esc(c.example))) continue;
        seen++;
        for (const f of c.example_facts) expect(html).toContain(esc(`${f.name}${f.item ? ` (${f.list === "people" ? "person" : "item"} ${f.item})` : ""}: ${f.value}`));
      }
    });
    expect(seen).toBeGreaterThan(0);
  });

  test("each step's heading can take focus, so Next can move keyboard focus to it", () => {
    const v = view();
    r.steps.forEach((_, i) => expect(v.stepHtml(i)).toContain('<h2 tabindex="-1">'));
  });

  test("a malformed answers line stops the build and names the file and line, instead of reading as no answers", () => {
    expect(() => parseAnswers('{"type":"send","ids":[]}\n\n{"type":', "recording/x/answers.jsonl")).toThrow(/recording\/x\/answers\.jsonl, line 3: not JSON/);
    expect(parseAnswers('{"a":1}\n\n{"b":2}\n', "w")).toEqual([{ a: 1 }, { b: 2 }]);
    expect(parseAnswers("", "w")).toEqual([]);
  });

  test("the page sets a viewport, so a phone lays it out at its own width", () => {
    expect(buildPage()).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  test("the page keeps a script-ending tag in the data from closing the script", () => {
    expect(buildPage().match(/<\/script>/g)?.length).toBe(2);
  });
});
