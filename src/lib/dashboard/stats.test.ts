import { describe, it, expect, vi, beforeEach } from "vitest";

const count = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { count: (...a: any) => count(...a) } },
}));

import { getActivityStats } from "@/lib/dashboard/stats";

describe("getActivityStats", () => {
  beforeEach(() => {
    // order of the 4 count() calls: appliedThisWeek, appliedTotal, interviewing, advanced
    count
      .mockResolvedValueOnce(3)  // appliedThisWeek
      .mockResolvedValueOnce(10) // appliedTotal
      .mockResolvedValueOnce(2)  // interviewing
      .mockResolvedValueOnce(4); // advanced (interviewing+offer)
  });

  it("scopes every count to the userId", async () => {
    await getActivityStats("u1");
    for (const call of count.mock.calls) {
      expect(call[0].where.userId).toBe("u1");
    }
  });

  it("counts appliedThisWeek with appliedAt gte start of week (Monday)", async () => {
    await getActivityStats("u1");
    const args = count.mock.calls[0][0];
    const gte: Date = args.where.appliedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    expect(gte.getDay()).toBe(1); // Monday
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
  });

  it("counts appliedTotal as applications with appliedAt set", async () => {
    await getActivityStats("u1");
    const args = count.mock.calls[1][0];
    expect(args.where.appliedAt).toEqual({ not: null });
  });

  it("counts interviewing by status", async () => {
    await getActivityStats("u1");
    expect(count.mock.calls[2][0].where.status).toBe("interviewing");
  });

  it("computes responseRate = round((interviewing+offer)/appliedTotal * 100)", async () => {
    const result = await getActivityStats("u1");
    expect(result).toEqual({
      appliedThisWeek: 3,
      appliedTotal: 10,
      interviewing: 2,
      responseRate: 40, // 4/10
    });
  });

  it("responseRate is null when appliedTotal is 0", async () => {
    count.mockReset();
    count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const result = await getActivityStats("u1");
    expect(result.responseRate).toBeNull();
  });
});
