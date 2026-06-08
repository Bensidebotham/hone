import { describe, it, expect, vi } from "vitest";

// --- @/lib/db mock (for composite / funnel logic) ---
const latestByType: Record<string, any> = {
  resume: { score: 80 }, linkedin: { score: 60 }, site: null,
};
const findFirst = vi.fn(({ where }: any) => Promise.resolve(latestByType[where.type]));
const groupBy = vi.fn().mockResolvedValue([
  { status: "saved", _count: { _all: 3 } }, { status: "applied", _count: { _all: 2 } },
]);
vi.mock("@/lib/db", () => ({ prisma: {
  analysis: { findFirst: (a: any) => findFirst(a) },
  application: { groupBy: (...a: any) => groupBy(...a) },
} }));

// --- mock the three new helpers (Option B) ---
// Use inline values in factory functions to avoid hoisting issues with const declarations.
vi.mock("@/lib/health/new-jobs", () => ({
  getNewJobsToday: vi.fn().mockResolvedValue([{ id: "j1", title: "SWE" }]),
}));
vi.mock("@/lib/health/app-updates", () => ({
  getRecentAppUpdates: vi.fn().mockResolvedValue([
    { id: "a1", status: "applied", updatedAt: new Date("2026-06-08"), job: { title: "SWE", company: "Acme" } },
  ]),
}));
vi.mock("@/lib/health/health-trend", () => ({
  getHealthTrend: vi.fn().mockResolvedValue([
    { date: "2026-06-01", composite: 65 },
    { date: "2026-06-08", composite: 70 },
  ]),
}));

import { getDashboardSummary } from "@/lib/health/summary";

describe("getDashboardSummary", () => {
  it("returns composite + per-component + funnel counts", async () => {
    const s = await getDashboardSummary("u1");
    expect(s.composite).toBe(70);
    expect(s.components).toEqual({ resume: 80, linkedin: 60, site: null });
    expect(s.funnel.saved).toBe(3);
    expect(s.funnel.applied).toBe(2);
    expect(s.funnel.interviewing).toBe(0);
  });

  it("returns newJobs, appUpdates, and healthTrend from helpers", async () => {
    const s = await getDashboardSummary("u1");
    expect(s.newJobs).toEqual([{ id: "j1", title: "SWE" }]);
    expect(s.appUpdates).toEqual([
      { id: "a1", status: "applied", updatedAt: new Date("2026-06-08"), job: { title: "SWE", company: "Acme" } },
    ]);
    expect(s.healthTrend).toEqual([
      { date: "2026-06-01", composite: 65 },
      { date: "2026-06-08", composite: 70 },
    ]);
  });
});
