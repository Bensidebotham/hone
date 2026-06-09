import { describe, it, expect } from "vitest";
import { companyDomain, monogram } from "./logo";

describe("companyDomain", () => {
  it("lowercases and appends .com", () => {
    expect(companyDomain("Stripe")).toBe("stripe.com");
  });
  it("strips spaces and punctuation", () => {
    expect(companyDomain("Acme, Co.")).toBe("acme.com");
  });
  it("strips common corporate suffixes", () => {
    expect(companyDomain("Globex Inc")).toBe("globex.com");
    expect(companyDomain("Initech LLC")).toBe("initech.com");
  });
  it("returns null for empty input", () => {
    expect(companyDomain("")).toBeNull();
  });
});

describe("monogram", () => {
  it("returns the first alphanumeric char uppercased", () => {
    expect(monogram("stripe")).toBe("S");
    expect(monogram("  9to5")).toBe("9");
  });
  it("falls back to ? for empty", () => {
    expect(monogram("")).toBe("?");
  });
});
