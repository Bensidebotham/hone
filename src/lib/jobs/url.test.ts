import { describe, it, expect } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("lowercases host+path and strips query/hash/trailing slash", () => {
    expect(normalizeUrl("https://Boards.Greenhouse.io/Stripe/jobs/123/")).toBe("boards.greenhouse.io/stripe/jobs/123");
    expect(normalizeUrl("https://x.com/a?utm=1#frag")).toBe("x.com/a");
  });
  it("treats http/https the same path-wise (host kept)", () => {
    expect(normalizeUrl("http://x.com/a")).toBe("x.com/a");
  });
  it("returns null for empty or invalid input", () => {
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});
