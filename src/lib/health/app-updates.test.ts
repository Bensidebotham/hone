import { describe, it, expect, vi } from "vitest";

const mockJob = {
  id: "j1",
  title: "SWE",
  company: "Acme",
  descriptionText: "x",
};

const findMany = vi.fn().mockResolvedValue([
  { id: "a1", status: "applied", updatedAt: new Date("2026-06-08T10:00:00Z"), job: { ...mockJob } },
  { id: "a2", status: "interviewing", updatedAt: new Date("2026-06-08T09:00:00Z"), job: { ...mockJob, id: "j2", title: "PM", company: "Beta" } },
]);
vi.mock("@/lib/db", () => ({ prisma: { application: { findMany: (...a: any) => findMany(...a) } } }));

import { getRecentAppUpdates } from "@/lib/health/app-updates";

describe("getRecentAppUpdates", () => {
  it("calls findMany with where.userId, 24h-ago gte, include job, orderBy updatedAt desc, default take=10", async () => {
    const before = Date.now();

    await getRecentAppUpdates("user-abc");

    expect(findMany).toHaveBeenCalledOnce();
    const [args] = findMany.mock.calls;
    const { where, include, orderBy, take } = args[0];

    // userId scoping — project's #1 invariant
    expect(where.userId).toBe("user-abc");

    // 24h-ago assertion: gte should be within 1 second of (before - 24h)
    const expectedGte = before - 24 * 60 * 60 * 1000;
    const gte: Date = where.updatedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    expect(Math.abs(gte.getTime() - expectedGte)).toBeLessThan(1000);

    // include job relation
    expect(include).toEqual({ job: true });

    // orderBy updatedAt desc
    expect(orderBy).toEqual({ updatedAt: "desc" });

    // default take
    expect(take).toBe(10);
  });

  it("honours a custom limit", async () => {
    await getRecentAppUpdates("user-abc", 5);
    const [args] = findMany.mock.calls;
    expect(args[0].take).toBe(5);
  });

  it("maps rows to {id, status, updatedAt, job:{title,company}} only — no extra fields", async () => {
    const result = await getRecentAppUpdates("user-abc");

    expect(result).toHaveLength(2);

    // First row
    expect(result[0]).toEqual({
      id: "a1",
      status: "applied",
      updatedAt: new Date("2026-06-08T10:00:00Z"),
      job: { title: "SWE", company: "Acme" },
    });

    // Extra fields from mock job (id, descriptionText) must NOT appear
    expect(result[0].job).not.toHaveProperty("id");
    expect(result[0].job).not.toHaveProperty("descriptionText");

    // Second row shape check
    expect(result[1]).toEqual({
      id: "a2",
      status: "interviewing",
      updatedAt: new Date("2026-06-08T09:00:00Z"),
      job: { title: "PM", company: "Beta" },
    });
  });
});
