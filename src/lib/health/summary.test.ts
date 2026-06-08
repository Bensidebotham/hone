import { describe, it, expect, vi } from "vitest";
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
});
