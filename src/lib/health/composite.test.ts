import { describe, it, expect } from "vitest";
import { computeComposite } from "@/lib/health/composite";

describe("computeComposite", () => {
  it("averages available scores, ignoring nulls", () => {
    expect(computeComposite({ resume: 80, linkedin: 60, site: null })).toBe(70);
  });
  it("returns 0 when nothing analyzed", () => {
    expect(computeComposite({ resume: null, linkedin: null, site: null })).toBe(0);
  });
  it("rounds to nearest integer", () => {
    expect(computeComposite({ resume: 80, linkedin: 75, site: null })).toBe(78);
  });
});
