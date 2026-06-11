import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { findMany: (...a: any) => findMany(...a) } },
}));

import { getApplicationTrend, WEEKS } from "@/lib/dashboard/application-trend";

describe("getApplicationTrend", () => {
  it("queries applications with appliedAt set, scoped to userId, gte ~10 weeks ago", async () => {
    findMany.mockResolvedValueOnce([]);
    const before = Date.now();
    await getApplicationTrend("u1");
    const args = findMany.mock.calls[0][0];
    expect(args.where.userId).toBe("u1");
    expect(args.where.appliedAt.not).toBeNull();
    const gte: Date = args.where.appliedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    const tenWeeksMs = WEEKS * 7 * 24 * 60 * 60 * 1000;
    // gte is the Monday on/just before (now - 10 weeks); allow up to 8 days slack
    expect(before - gte.getTime()).toBeGreaterThan(tenWeeksMs - 24 * 60 * 60 * 1000);
    expect(before - gte.getTime()).toBeLessThan(tenWeeksMs + 8 * 24 * 60 * 60 * 1000);
  });

  it("returns exactly WEEKS points, oldest→newest, weekStart as YYYY-MM-DD", async () => {
    findMany.mockResolvedValueOnce([]);
    const result = await getApplicationTrend("u1");
    expect(result).toHaveLength(WEEKS);
    expect(result[0].weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // strictly increasing weekStart
    for (let i = 1; i < result.length; i++) {
      expect(result[i].weekStart > result[i - 1].weekStart).toBe(true);
    }
    // empty data → all zero counts
    expect(result.every((p) => p.count === 0)).toBe(true);
  });

  it("buckets an application into the week containing its appliedAt", async () => {
    // appliedAt = the most recent week's Monday + 2 days → lands in last bucket
    const now = new Date();
    findMany.mockResolvedValueOnce([{ appliedAt: now }]);
    const result = await getApplicationTrend("u1");
    expect(result[result.length - 1].count).toBe(1);
    const total = result.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(1);
  });
});
