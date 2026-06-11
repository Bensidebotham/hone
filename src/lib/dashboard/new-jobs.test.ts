// src/lib/dashboard/new-jobs.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/db", () => ({
  prisma: { job: { findMany: (...a: any) => findMany(...a) } },
}));

beforeEach(() => {
  findMany.mockClear();
});

import { getNewJobs24h } from "@/lib/dashboard/new-jobs";

describe("getNewJobs24h", () => {
  it("filters source=ats and postedAt within the last 24h", async () => {
    const before = Date.now();
    await getNewJobs24h();
    const args = findMany.mock.calls[0][0];
    expect(args.where.source).toBe("ats");
    const gte: Date = args.where.postedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    const expected = before - 24 * 60 * 60 * 1000;
    expect(Math.abs(gte.getTime() - expected)).toBeLessThan(1000);
  });

  it("orders by postedAt desc and defaults take=25", async () => {
    await getNewJobs24h();
    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ postedAt: "desc" });
    expect(args.take).toBe(25);
  });

  it("honours a custom limit", async () => {
    await getNewJobs24h(5);
    expect(findMany.mock.calls[findMany.mock.calls.length - 1][0].take).toBe(5);
  });
});
