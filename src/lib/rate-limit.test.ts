import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetRateLimits } from "@/lib/rate-limit";

beforeEach(() => __resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit within a window", () => {
    expect(rateLimit("u1", 3, 1000, 0).ok).toBe(true);
    expect(rateLimit("u1", 3, 1000, 10).ok).toBe(true);
    expect(rateLimit("u1", 3, 1000, 20).ok).toBe(true);
  });

  it("blocks the call that exceeds the limit and reports retryAfter", () => {
    rateLimit("u1", 2, 1000, 0);
    rateLimit("u1", 2, 1000, 0);
    const r = rateLimit("u1", 2, 1000, 400);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(1); // ~600ms left → ceil to 1s
  });

  it("resets after the window elapses", () => {
    rateLimit("u1", 1, 1000, 0);
    expect(rateLimit("u1", 1, 1000, 500).ok).toBe(false);
    expect(rateLimit("u1", 1, 1000, 1000).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    rateLimit("u1", 1, 1000, 0);
    expect(rateLimit("u1", 1, 1000, 0).ok).toBe(false);
    expect(rateLimit("u2", 1, 1000, 0).ok).toBe(true);
  });
});
