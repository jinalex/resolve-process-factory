import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { readAnswers } from "../core/answers.ts";
import { ROOT } from "../core/load.ts";
import { buildPage, loadRecording, parseAnswers } from "./build.ts";

describe("the replay page", () => {
  const r = loadRecording();

  test("the committed page is built from the recording as it is", () => {
    expect(readFileSync(join(ROOT, "replay/index.html"), "utf8")).toBe(buildPage());
  });

  test("every step's answers file only adds to the one before, and each answer it sends, as it stood when sent, picks a shown, checked option", () => {
    let before: string[] = [];
    let sends = 0;
    for (const step of r.steps) {
      const lines = (step.answers as Record<string, any>[]).map((a) => JSON.stringify(a));
      // Append-only: a step's file starts with everything the step before had.
      expect(lines.slice(0, before.length)).toEqual(before);
      before = lines;
      for (const version of new Set(r.steps.map((x) => x.spec.version))) {
        // The owner answers on the last step of a version, where each option's impact is shown.
        const asked = r.steps.filter((x) => x.spec.version === version).at(-1)!;
        const read = readAnswers(lines.join("\n"), version, asked.spec.spec_hash);
        expect(read.problems).toEqual([]);
        for (const a of read.findings) {
          sends++;
          const f = asked.spec.findings.find((x: any) => x.id === a.id);
          expect(f.options).toContain(a.choice);
          const o = f.option_edits.find((x: any) => x.option === a.choice);
          const impact = f.impact.find((i: any) => i.option === a.choice);
          expect(impact.problems).toEqual([]);
          // The impact the owner saw is of this option's edits on this spec (core/pane.ts impactKey).
          expect(impact.of).toBe(createHash("sha256").update(JSON.stringify([asked.spec.spec_hash, o.option, o.edits])).digest("hex").slice(0, 16));
          expect(a.rule_ids).toEqual(f.rule_ids);
        }
      }
    }
    expect(sends).toBeGreaterThan(0);
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
      expect(s.focus.length).toBeGreaterThan(0);
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

  test("every part a step's focus names is drawn on that step, so the highlight never points at nothing", () => {
    const v = view();
    r.steps.forEach((s, i) => {
      const html = v.stepHtml(i);
      for (const f of s.focus) expect(html, `step ${i + 1}, focus "${f}"`).toContain(`data-part="${f}"`);
    });
  });

  test("a version's change list shows once, on the step that wrote the version", () => {
    const v = view();
    r.steps.forEach((s, i) => {
      const shows = v.stepHtml(i).includes('data-part="changes"');
      expect(shows, `step ${i + 1}`).toBe(i > 0 && r.steps[i - 1].spec.version !== s.spec.version && (s.spec.changes_from_previous ?? []).length > 0);
    });
  });

  test("a new problem an option would raise shows the title Resolve recorded, beside any plain wording", () => {
    const v = view();
    let seen = 0;
    r.steps.forEach((s, i) => {
      const html = v.stepHtml(i);
      for (const f of s.spec.findings) for (const imp of f.impact ?? []) for (const n of imp.new_findings ?? []) {
        if (!html.includes("New problem:")) continue;
        seen++;
        expect(html).toContain(n.title);
      }
    });
    expect(seen).toBeGreaterThan(0);
  });

  test("the step copy calls a finding by its kind: no \"gap\" for a missing-information finding", () => {
    for (const s of r.steps) expect(`${s.title} ${s.result} ${s.text}`).not.toMatch(/\bgap\b/i);
  });

  test("a step shows each option's impact whenever its files have one", () => {
    const v = view();
    r.steps.forEach((s, i) => {
      const html = v.stepHtml(i);
      const n = s.spec.findings.reduce((k: number, f: any) => k + (f.impact?.length ?? 0), 0);
      expect(html.split('data-part="impact"').length - 1, `step ${i + 1}`).toBe(n);
    });
  });

  test("the plain question keeps both cases Claude's question names: a check not done, and one not back yet", () => {
    for (const s of r.steps) for (const f of s.spec.findings) {
      const plain = (r.display.findings as any)[f.id]?.question;
      if (!plain || !f.question) continue;
      if (/hasn't been done/.test(f.question)) expect(plain).toMatch(/not done/);
      if (/come back/.test(f.question)) expect(plain).toMatch(/not back|come back/);
    }
  });

  test("every finding shows the text of each section it cites, without hovering", () => {
    const v = view();
    const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    r.steps.forEach((s, i) => {
      const html = v.stepHtml(i);
      for (const f of s.spec.findings) for (const ref of f.sop_refs) expect(html).toContain(`<strong>${ref}</strong> <span class="sop-text">${esc(r.sop[ref])}</span>`);
    });
  });

  test("a step marks the SOP owner's pick only when its own or the next step's answers file sends it", () => {
    const v = view();
    r.steps.forEach((s, i) => {
      const html = v.stepHtml(i);
      const sends = (k: number) => ((r.steps[k]?.answers ?? []) as any[]).some((a) => a.type === "send" && a.spec_version === s.spec.version);
      if (html.includes('class="chosen-tag"')) expect(sends(i) || sends(i + 1), `step ${i + 1}`).toBe(true);
      if (html.includes("picks this in the next step")) expect(sends(i + 1)).toBe(true);
    });
    expect(r.steps.some((_, i) => v.stepHtml(i).includes('class="chosen-tag"'))).toBe(true);
  });

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

  test("the details toggle says what pressing it does, and is pressed only when every detail shows", () => {
    expect(view().stepHtml(0)).toContain('aria-pressed="false">Show all details</button>');
  });

  test("an option column never asks for more than the card's width", () => {
    expect(readFileSync(join(ROOT, "replay/style.css"), "utf8")).toMatch(/\.options \{[^}]*minmax\(min\(18rem, 100%\), 1fr\)/);
  });

  test("outcome stamps on the yellow sit on paper, where every outcome colour has 4.5:1 contrast", () => {
    const css = readFileSync(join(ROOT, "replay/style.css"), "utf8");
    expect(css).toMatch(/\.option\.chosen \.stamp, \.case\.flipped \.stamp[^{]*\{ background: var\(--surface\); \}/);
    // WCAG contrast of each light-mode outcome colour on the paper (#ffffff).
    const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const root = /:root \{([^}]*)\}/.exec(css)![1];
    for (const t of ["approve", "request", "escalate", "decline", "incomplete"]) {
      const hex = new RegExp(`--${t}: (#[0-9a-f]{6})`).exec(root)![1];
      expect(1.05 / (lum(hex) + 0.05), t).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("the page sets a viewport, so a phone lays it out at its own width", () => {
    expect(buildPage()).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  test("the recording inside the page has no raw \"<\", so no tag or comment in it can end the script", () => {
    const data = /<script>window\.REPLAY = (.*);<\/script>/s.exec(buildPage())![1];
    expect(data).not.toContain("<");
    expect(JSON.parse(data).steps.length).toBe(r.steps.length);
  });

  test("the page keeps a script-ending tag in the data from closing the script", () => {
    expect(buildPage().match(/<\/script>/g)?.length).toBe(2);
  });
});
