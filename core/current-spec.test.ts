import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPEC_COPY, currentSpecFile, newestSpec, restore } from "./current-spec.ts";
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
      expect(() => currentSpecFile(undefined, withCopy(v9, "another-hash"))).toThrow(/run: pnpm resolve spec\/kyb-v\d+\.json/);
      expect(() => currentSpecFile(undefined, withCopy({ ...v9, version: 8 }))).toThrow("has no copy of it");
      expect(existsSync(file)).toBe(false);
    });
    it("names no spec when the domain has none", () => expect(newestSpec("nothing")).toBeNull());
    it("refuses a domain that isn't a plain name, so nothing is written outside spec/", () => {
      const out = pane({ domain: "../../x", version: 1, spec_hash: "h" });
      writeFileSync(join(out, SPEC_COPY), JSON.stringify({ domain: "../../x", version: 1 }));
      expect(() => currentSpecFile(undefined, out)).toThrow("isn't a plain name");
      expect(existsSync(join(ROOT, "../x-v1.json"))).toBe(false);
    });
    it("when another run writes the file first, uses it only if it is the very spec, and never overwrites it", () => {
      const shown = { domain: "kyb", version: 9, spec_hash: specHash(v9) };
      try {
        writeFileSync(file, JSON.stringify(v9));
        expect(() => restore(withCopy(v9), shown, file)).not.toThrow();
        writeFileSync(file, JSON.stringify({ ...v9, rules: [] }));
        expect(() => restore(withCopy(v9), shown, file)).toThrow("isn't the spec the pane was built on");
        expect(JSON.parse(readFileSync(file, "utf8")).rules).toEqual([]);
      } finally { if (existsSync(file)) unlinkSync(file); }
    });
    it("leaves a spec file that is there but broken for a person, rather than call it missing", () => {
      try {
        writeFileSync(file, "");
        expect(() => currentSpecFile(undefined, withCopy(v9))).toThrow("isn't valid JSON");
        expect(readFileSync(file, "utf8")).toBe("");
      } finally { if (existsSync(file)) unlinkSync(file); }
    });
  });
});
