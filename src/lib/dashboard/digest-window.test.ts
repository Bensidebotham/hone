import { describe, it, expect, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...a: any) => findUnique(...a),
      update: (...a: any) => update(...a),
    },
  },
}));

import { computeWindowStart, getDigestWindow, stampDashboardVisit } from "@/lib/dashboard/digest-window";

const DAY = 24 * 60 * 60 * 1000;

describe("computeWindowStart", () => {
  const now = new Date("2026-06-10T12:00:00Z");

  it("uses 24h ago when there is no prior visit", () => {
    expect(computeWindowStart(now, null).getTime()).toBe(now.getTime() - DAY);
  });

  it("uses 24h ago when the last visit was less than 24h ago", () => {
    const lastVisit = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3h ago
    expect(computeWindowStart(now, lastVisit).getTime()).toBe(now.getTime() - DAY);
  });

  it("stretches back to the last visit when it was more than 24h ago", () => {
    const lastVisit = new Date(now.getTime() - 3 * DAY); // 3 days ago
    expect(computeWindowStart(now, lastVisit).getTime()).toBe(lastVisit.getTime());
  });
});

describe("getDigestWindow", () => {
  it("reads lastDashboardVisitAt scoped by userId and returns previousVisitAt", async () => {
    const lastVisit = new Date(Date.now() - 3 * DAY);
    findUnique.mockResolvedValueOnce({ lastDashboardVisitAt: lastVisit });

    const { windowStart, previousVisitAt } = await getDigestWindow("user-abc");

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-abc" },
      select: { lastDashboardVisitAt: true },
    });
    expect(previousVisitAt).toEqual(lastVisit);
    expect(windowStart.getTime()).toBe(lastVisit.getTime());
  });
});

describe("stampDashboardVisit", () => {
  it("updates lastDashboardVisitAt to ~now for the user", async () => {
    const before = Date.now();
    await stampDashboardVisit("user-abc");
    const [args] = update.mock.calls;
    expect(args[0].where).toEqual({ id: "user-abc" });
    const stamped: Date = args[0].data.lastDashboardVisitAt;
    expect(Math.abs(stamped.getTime() - before)).toBeLessThan(1000);
  });
});
