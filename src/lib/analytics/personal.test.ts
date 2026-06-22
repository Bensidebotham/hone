import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    application: { groupBy: (...a: any) => groupBy(...a) },
    applicationEvent: { findMany: (...a: any) => findMany(...a) },
  },
}));

import {
  getFunnel,
  getConversion,
  getTimeInStage,
  median,
} from "@/lib/analytics/personal";

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

describe("median", () => {
  it("returns the middle of an odd-length sorted set", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middle values for even length", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("returns null for empty input", () => {
    expect(median([])).toBeNull();
  });
});

describe("getTimeInStage", () => {
  beforeEach(() => findMany.mockReset());

  const ev = (
    applicationId: string,
    fromStatus: string | null,
    toStatus: string | null,
    iso: string,
  ) => ({ applicationId, fromStatus, toStatus, createdAt: new Date(iso) });

  it("scopes to user + status_change events", async () => {
    findMany.mockResolvedValue([]);
    await getTimeInStage("u1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.userId).toBe("u1");
    expect(arg.where.type).toBe("status_change");
  });

  it("computes median applied->response and interview->decision in days", async () => {
    findMany.mockResolvedValue([
      // app a: applied day 0, response (interviewing) day 2  -> 2d
      ev("a", null, "applied", "2026-01-01T00:00:00Z"),
      ev("a", "applied", "interviewing", "2026-01-03T00:00:00Z"),
      // app b: applied day 0, response day 4 -> 4d
      ev("b", null, "applied", "2026-01-01T00:00:00Z"),
      ev("b", "applied", "rejected", "2026-01-05T00:00:00Z"),
      // app c: applied day 0, response day 6 -> 6d
      ev("c", null, "applied", "2026-01-01T00:00:00Z"),
      ev("c", "applied", "interviewing", "2026-01-07T00:00:00Z"),
      // app c also interview day 6 -> offer day 8 -> 2d decision
      ev("c", "interviewing", "offer", "2026-01-09T00:00:00Z"),
    ]);
    const t = await getTimeInStage("u1");
    expect(t.appliedToResponseN).toBe(3);
    expect(t.appliedToResponseDays).toBe(4); // median(2,4,6)
    expect(t.interviewToDecisionN).toBe(1);
    expect(t.interviewToDecisionDays).toBeNull(); // n < 3
  });
});
