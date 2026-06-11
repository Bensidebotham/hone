import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/dashboard/digest-window", () => ({
  getDigestWindow: vi.fn().mockResolvedValue({
    windowStart: new Date("2026-06-09T00:00:00Z"),
    previousVisitAt: new Date("2026-06-09T12:00:00Z"),
  }),
}));
vi.mock("@/lib/dashboard/application-trend", () => ({
  getApplicationTrend: vi.fn().mockResolvedValue([{ weekStart: "2026-06-08", count: 2 }]),
}));
vi.mock("@/lib/dashboard/new-jobs", () => ({
  getNewJobsForUser: vi.fn().mockResolvedValue([{ id: "j1" }]),
}));
vi.mock("@/lib/health/app-updates", () => ({
  getRecentAppUpdates: vi.fn().mockResolvedValue([{ id: "e1", isNew: true }]),
}));
vi.mock("@/lib/gmail/suggestions", () => ({
  getPendingSuggestions: vi.fn().mockResolvedValue([]),
}));

import { getDashboardSummary } from "@/lib/dashboard/summary";

describe("getDashboardSummary", () => {
  it("returns only digest data: window, applicationTrend, newJobs, appUpdates", async () => {
    const summary = await getDashboardSummary("user-abc");

    expect(summary).toEqual({
      previousVisitAt: new Date("2026-06-09T12:00:00Z"),
      applicationTrend: [{ weekStart: "2026-06-08", count: 2 }],
      newJobs: [{ id: "j1" }],
      appUpdates: [{ id: "e1", isNew: true }],
      pendingSuggestions: [],
    });
    // removed fields
    expect(summary).not.toHaveProperty("stats");
    expect(summary).not.toHaveProperty("funnel");
    expect(summary).not.toHaveProperty("interviewing");
    expect(summary).not.toHaveProperty("savedNotApplied");
  });
});
