import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/db", () => ({
  prisma: { job: { findMany: (...a: any) => findMany(...a) } },
}));

import { getNewJobsForUser } from "@/lib/dashboard/new-jobs";

describe("getNewJobsForUser", () => {
  it("filters by curated pool, window, and excludes the user's pipeline jobs", async () => {
    const windowStart = new Date("2026-06-09T00:00:00Z");
    await getNewJobsForUser("user-abc", windowStart);

    const [args] = findMany.mock.calls;
    const where = args[0].where;

    // composed with AND of: curated base, posted window, not-in-pipeline
    expect(Array.isArray(where.AND)).toBe(true);

    const flat = JSON.stringify(where);
    // curated pool markers from buildJobWhere
    expect(flat).toContain('"active":true');
    expect(flat).toContain('"roleCategory"');
    // window
    expect(where.AND.some((c: any) => c.postedAt?.gte?.getTime?.() === windowStart.getTime())).toBe(true);
    // pipeline exclusion
    expect(where.AND.some((c: any) => c.applications?.none?.userId === "user-abc")).toBe(true);

    expect(args[0].orderBy).toEqual({ postedAt: "desc" });
    expect(args[0].take).toBe(5);
  });

  it("honours a custom limit", async () => {
    await getNewJobsForUser("user-abc", new Date(), 10);
    const [args] = findMany.mock.calls;
    expect(args[0].take).toBe(10);
  });
});
