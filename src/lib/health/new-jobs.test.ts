import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([{ id: "j1" }, { id: "j2" }]);
vi.mock("@/lib/db", () => ({ prisma: { job: { findMany: (...a: any) => findMany(...a) } } }));

import { getNewJobsToday } from "@/lib/health/new-jobs";

describe("getNewJobsToday", () => {
  it("calls findMany with source=ats, start-of-today gte, desc orderBy, and default take=10", async () => {
    const before = new Date();
    before.setHours(0, 0, 0, 0);

    await getNewJobsToday();

    expect(findMany).toHaveBeenCalledOnce();
    const [args] = findMany.mock.calls;
    const { where, orderBy, take } = args[0];

    expect(where.source).toBe("ats");
    expect(orderBy).toEqual({ postedAt: "desc" });
    expect(take).toBe(10);

    // start-of-today assertion: hours/min/sec/ms all 0, same calendar day as now
    const gte: Date = where.postedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
    expect(gte.getSeconds()).toBe(0);
    expect(gte.getMilliseconds()).toBe(0);
    const now = new Date();
    expect(gte.getFullYear()).toBe(now.getFullYear());
    expect(gte.getMonth()).toBe(now.getMonth());
    expect(gte.getDate()).toBe(now.getDate());
    // gte must be <= before (i.e. at or before the snapshot we took)
    expect(gte.getTime()).toBeLessThanOrEqual(before.getTime() + 1);
  });

  it("returns the rows from findMany", async () => {
    const result = await getNewJobsToday();
    expect(result).toEqual([{ id: "j1" }, { id: "j2" }]);
  });

  it("honours a custom limit", async () => {
    await getNewJobsToday(5);
    const [args] = findMany.mock.calls;
    expect(args[0].take).toBe(5);
  });
});
