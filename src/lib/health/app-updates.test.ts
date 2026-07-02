import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([
  {
    id: "e1",
    type: "status_change",
    toStatus: "interviewing",
    summary: "Moved to Interviewing",
    createdAt: new Date("2026-06-09T10:00:00Z"),
    application: { id: "a1", company: "Acme", title: "SWE" },
  },
  {
    id: "e2",
    type: "created",
    toStatus: "saved",
    summary: "Added to tracker",
    createdAt: new Date("2026-06-09T09:00:00Z"),
    application: { id: "a2", company: "Beta", title: "PM" },
  },
]);
vi.mock("@/lib/db", () => ({
  prisma: { applicationEvent: { findMany: (...a: any) => findMany(...a) } },
}));

import { getRecentAppUpdates } from "@/lib/health/app-updates";

describe("getRecentAppUpdates", () => {
  it("queries events scoped by userId, since windowStart, newest first, with app+job", async () => {
    const windowStart = new Date("2026-06-08T00:00:00Z");
    await getRecentAppUpdates("user-abc", windowStart);

    const [args] = findMany.mock.calls;
    expect(args[0].where.userId).toBe("user-abc");
    expect(args[0].where.createdAt).toEqual({ gte: windowStart });
    expect(args[0].orderBy).toEqual({ createdAt: "desc" });
    expect(args[0].include).toEqual({
      application: { select: { id: true, company: true, title: true } },
    });
  });

  it("maps rows to display shape, including isNew relative to previousVisitAt", async () => {
    const windowStart = new Date("2026-06-08T00:00:00Z");
    const previousVisitAt = new Date("2026-06-09T09:30:00Z");
    const rows = await getRecentAppUpdates("user-abc", windowStart, previousVisitAt);

    expect(rows[0]).toEqual({
      id: "e1",
      applicationId: "a1",
      status: "interviewing",
      summary: "Moved to Interviewing",
      createdAt: new Date("2026-06-09T10:00:00Z"),
      isNew: true, // after previousVisitAt
      title: "SWE",
      company: "Acme",
    });
    expect(rows[1].isNew).toBe(false); // before previousVisitAt
  });

  it("treats every row as new when there is no previous visit", async () => {
    const rows = await getRecentAppUpdates("user-abc", new Date("2026-06-08T00:00:00Z"), null);
    expect(rows.every((r) => r.isNew)).toBe(true);
  });
});
