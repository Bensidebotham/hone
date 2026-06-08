import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([
  {
    id: "h1",
    userId: "u1",
    composite: 70,
    createdAt: new Date("2026-05-10T08:00:00Z"),
    resume: 80,
    linkedin: 60,
    site: null,
  },
]);
vi.mock("@/lib/db", () => ({
  prisma: { healthScore: { findMany: (...a: any) => findMany(...a) } },
}));

import { getHealthTrend } from "@/lib/health/health-trend";

describe("getHealthTrend", () => {
  it("calls findMany with correct userId filter", async () => {
    await getHealthTrend("u1");
    const [args] = findMany.mock.calls[0];
    expect(args.where.userId).toBe("u1");
  });

  it("calls findMany with createdAt.gte approximately 30 days ago", async () => {
    const before = Date.now();
    await getHealthTrend("u1");
    const [args] = findMany.mock.calls[0];
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const expectedGte = before - thirtyDaysMs;
    const actualGte: Date = args.where.createdAt.gte;
    expect(actualGte).toBeInstanceOf(Date);
    expect(Math.abs(actualGte.getTime() - expectedGte)).toBeLessThan(1000);
  });

  it("calls findMany with orderBy createdAt asc", async () => {
    await getHealthTrend("u1");
    const [args] = findMany.mock.calls[0];
    expect(args.orderBy).toEqual({ createdAt: "asc" });
  });

  it("maps rows to { date, composite } with YYYY-MM-DD date slice", async () => {
    const result = await getHealthTrend("u1");
    expect(result).toEqual([{ date: "2026-05-10", composite: 70 }]);
  });

  it("does not include extra fields (no id, userId, resume, linkedin, site)", async () => {
    const result = await getHealthTrend("u1");
    const point = result[0];
    expect(Object.keys(point).sort()).toEqual(["composite", "date"]);
  });

  it("scopes to the given userId and not another user", async () => {
    findMany.mockResolvedValueOnce([]);
    const result = await getHealthTrend("u2");
    const [args] = findMany.mock.calls[0];
    expect(args.where.userId).toBe("u2");
    expect(result).toEqual([]);
  });
});
