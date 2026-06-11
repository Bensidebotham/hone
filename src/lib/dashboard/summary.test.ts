import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { groupBy: (...a: any) => groupBy(...a) } },
}));
vi.mock("@/lib/dashboard/stats", () => ({
  getActivityStats: vi.fn().mockResolvedValue({
    appliedThisWeek: 1, appliedTotal: 2, interviewing: 1, responseRate: 50,
  }),
}));
vi.mock("@/lib/dashboard/application-trend", () => ({
  getApplicationTrend: vi.fn().mockResolvedValue([{ weekStart: "2026-06-08", count: 1 }]),
}));
vi.mock("@/lib/dashboard/new-jobs", () => ({
  getNewJobs24h: vi.fn().mockResolvedValue([{ id: "j1" }]),
}));
vi.mock("@/lib/dashboard/lists", () => ({
  getInterviewing: vi.fn().mockResolvedValue([{ id: "i1" }]),
  getSavedNotApplied: vi.fn().mockResolvedValue([{ id: "s1" }]),
}));
vi.mock("@/lib/health/app-updates", () => ({
  getRecentAppUpdates: vi.fn().mockResolvedValue([{ id: "u1" }]),
}));

import { getDashboardSummary } from "@/lib/dashboard/summary";

describe("getDashboardSummary", () => {
  beforeEach(() => {
    groupBy.mockReset();
  });

  it("assembles all sections and zero-fills the funnel", async () => {
    groupBy.mockResolvedValueOnce([{ status: "applied", _count: { _all: 3 } }]);
    const s = await getDashboardSummary("u1");

    expect(s.stats.appliedTotal).toBe(2);
    expect(s.applicationTrend).toEqual([{ weekStart: "2026-06-08", count: 1 }]);
    expect(s.newJobs).toEqual([{ id: "j1" }]);
    expect(s.appUpdates).toEqual([{ id: "u1" }]);
    expect(s.interviewing).toEqual([{ id: "i1" }]);
    expect(s.savedNotApplied).toEqual([{ id: "s1" }]);
    expect(s.funnel).toEqual({
      saved: 0, applied: 3, interviewing: 0, offer: 0, rejected: 0,
    });
    expect(groupBy.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("does not expose any health fields", async () => {
    groupBy.mockResolvedValueOnce([]);
    const s = await getDashboardSummary("u1");
    expect(s).not.toHaveProperty("composite");
    expect(s).not.toHaveProperty("components");
    expect(s).not.toHaveProperty("healthTrend");
  });
});
