import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    application: { groupBy: (...a: any) => groupBy(...a) },
    applicationEvent: { findMany: (...a: any) => findMany(...a) },
  },
}));

import { getFunnel, getConversion } from "@/lib/analytics/personal";

describe("getFunnel", () => {
  beforeEach(() => {
    groupBy.mockReset();
    // status groupBy result for the user
    groupBy.mockResolvedValue([
      { status: "saved", _count: { _all: 5 } },
      { status: "applied", _count: { _all: 10 } },
      { status: "interviewing", _count: { _all: 3 } },
      { status: "offer", _count: { _all: 1 } },
      { status: "rejected", _count: { _all: 4 } },
    ]);
  });

  it("scopes the groupBy to the user", async () => {
    await getFunnel("u1");
    expect(groupBy.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("computes cumulative funnel stages excluding saved from applied", async () => {
    const f = await getFunnel("u1");
    // applied = applied+interviewing+offer+rejected = 18
    // interviewing = interviewing+offer = 4
    expect(f).toEqual({ applied: 18, interviewing: 4, offer: 1, rejected: 4 });
  });

  it("returns all-zero funnel when there are no applications", async () => {
    groupBy.mockResolvedValue([]);
    const f = await getFunnel("u1");
    expect(f).toEqual({ applied: 0, interviewing: 0, offer: 0, rejected: 0 });
  });
});

describe("getConversion", () => {
  it("computes percentages from funnel counts", () => {
    const c = getConversion({ applied: 18, interviewing: 4, offer: 1, rejected: 4 });
    expect(c.appliedToInterview).toBe(22); // round(4/18*100)
    expect(c.interviewToOffer).toBe(25); // round(1/4*100)
  });

  it("returns null for a stage with a zero denominator", () => {
    const c = getConversion({ applied: 0, interviewing: 0, offer: 0, rejected: 0 });
    expect(c.appliedToInterview).toBeNull();
    expect(c.interviewToOffer).toBeNull();
  });
});
