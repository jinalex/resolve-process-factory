import { describe, expect, it } from "vitest";
import { quoted, sections } from "./sop-text.ts";

describe("an SOP's sections", () => {
  const sop = [
    "# Claims SOP",
    "",
    "## 1. Purpose",
    "",
    "Every claim gets one outcome:",
    "- **Approve**: pay the claim.",
    "- **Reject**: don't.",
    "",
    "## 2. Lines",
    "",
    "2.1. A line over $75 needs an itemised receipt,",
    "whatever its category. Otherwise return the claim.",
    "",
    "2.2. Alcohol is never paid.",
    "This line is part of 2.2.",
    "",
    "Text after a blank line belongs to no section.",
  ].join("\n");

  it("reads a numbered paragraph whole, across the lines it is wrapped over", () => {
    const s = sections(sop);
    expect(s.get("2.1")).toBe("A line over $75 needs an itemised receipt, whatever its category. Otherwise return the claim.");
    expect(s.get("2.2")).toBe("Alcohol is never paid. This line is part of 2.2.");
    expect([...s.keys()]).toEqual(["1", "2.1", "2.2"]);
  });

  it("reads the words under a numbered heading as that section, one list item a line", () => {
    expect(sections(sop).get("1")).toBe("Every claim gets one outcome:\n**Approve**: pay the claim.\n**Reject**: don't.");
  });

  it("takes a sentence wrapped over two lines as one sentence", () => {
    const s = sections(sop);
    expect(quoted([s.get("2.1")!], "A line over $75 needs an itemised receipt, whatever its category.")).toBe(true);
  });
});
