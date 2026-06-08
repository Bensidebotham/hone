import { describe, it, expect } from "vitest";
import { notesSnippet, appliedDateLabel } from "@/lib/applications/format";

describe("notesSnippet", () => {
  it("returns empty string for null notes", () => {
    expect(notesSnippet(null)).toBe("");
  });

  it("returns empty string for empty notes", () => {
    expect(notesSnippet("")).toBe("");
  });

  it("returns full text when at or under max length", () => {
    const text = "Short note";
    expect(notesSnippet(text, 100)).toBe("Short note");
  });

  it("truncates to max chars with ellipsis when longer", () => {
    const text = "a".repeat(110);
    const result = notesSnippet(text, 100);
    expect(result).toBe("a".repeat(100) + "…");
  });

  it("uses default max of 100 chars", () => {
    const text = "x".repeat(105);
    const result = notesSnippet(text);
    expect(result).toBe("x".repeat(100) + "…");
  });

  it("returns exact-length text without ellipsis", () => {
    const text = "b".repeat(100);
    expect(notesSnippet(text, 100)).toBe(text);
  });
});

describe("appliedDateLabel", () => {
  const mockDate = new Date("2025-03-15T00:00:00Z");
  const mockUpdated = new Date("2025-04-01T00:00:00Z");

  it("returns 'Applied …' when appliedAt is present", () => {
    const result = appliedDateLabel(mockDate, mockUpdated);
    expect(result).toMatch(/^Applied /);
  });

  it("returns 'Updated …' when appliedAt is null", () => {
    const result = appliedDateLabel(null, mockUpdated);
    expect(result).toMatch(/^Updated /);
  });

  it("includes formatted date string for appliedAt path", () => {
    const result = appliedDateLabel(mockDate, mockUpdated);
    // Should contain a year
    expect(result).toMatch(/\d{4}/);
  });

  it("includes formatted date string for updatedAt path", () => {
    const result = appliedDateLabel(null, mockUpdated);
    expect(result).toMatch(/\d{4}/);
  });
});
