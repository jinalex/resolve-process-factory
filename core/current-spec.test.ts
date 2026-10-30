import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { currentSpecFile } from "./current-spec.ts";
import { ROOT } from "./load.ts";

const pane = (s: object | null) => {
  const out = mkdtempSync(join(tmpdir(), "current-spec-"));
  if (s) writeFileSync(join(out, "spec.json"), JSON.stringify(s));
  return out;
};

describe("currentSpecFile", () => {
  it("takes a named file from the folder the command ran in", () => {
    expect(currentSpecFile("my-spec.json", pane({ domain: "expenses", version: 1 }), "/work")).toBe("/work/my-spec.json");
  });
  it("else the version the pane shows, whatever its domain", () => {
    expect(currentSpecFile(undefined, pane({ domain: "expenses", version: 1 }))).toBe(join(ROOT, "spec/expenses-v1.json"));
  });
  it("else KYB's v1, when there's no pane or it names no version", () => {
    expect(currentSpecFile(undefined, pane(null))).toBe(join(ROOT, "spec/kyb-v1.json"));
    expect(currentSpecFile(undefined, pane({ findings: [] }))).toBe(join(ROOT, "spec/kyb-v1.json"));
  });
  it("refuses a version the pane shows but the repo doesn't have, rather than roll back to v1", () => {
    expect(() => currentSpecFile(undefined, pane({ domain: "kyb", version: 9 }))).toThrow("spec/kyb-v9.json isn't there");
  });
});
