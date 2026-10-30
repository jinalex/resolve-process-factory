import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPEC_COPY, currentSpecFile, newestSpec } from "./current-spec.ts";
import { specHash } from "./pane.ts";
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

  // A version next-spec wrote is a file nothing commits, so the pane keeps a copy of the spec it was built on.
  describe("a version whose file is gone", () => {
    const v9 = { ...JSON.parse(readFileSync(join(ROOT, "spec/kyb-v1.json"), "utf8")), version: 9 };
    const file = join(ROOT, "spec/kyb-v9.json");
    const withCopy = (copy: object, hash = specHash(v9)) => {
      const out = pane({ domain: "kyb", version: 9, spec_hash: hash });
      writeFileSync(join(out, SPEC_COPY), JSON.stringify(copy));
      return out;
    };
    it("is put back from the pane's copy when the copy is that very spec", () => {
      try {
        expect(currentSpecFile(undefined, withCopy(v9))).toBe(file);
        expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(v9);
      } finally { if (existsSync(file)) unlinkSync(file); }
    });
    it("isn't put back from a copy of another spec, and the error names the newest spec to rebuild on", () => {
      expect(() => currentSpecFile(undefined, withCopy(v9, "another-hash"))).toThrow("run: pnpm resolve spec/kyb-v1.json");
      expect(() => currentSpecFile(undefined, withCopy({ ...v9, version: 8 }))).toThrow("has no copy of it");
      expect(existsSync(file)).toBe(false);
    });
    it("names no spec when the domain has none", () => expect(newestSpec("nothing")).toBeNull());
  });
});
