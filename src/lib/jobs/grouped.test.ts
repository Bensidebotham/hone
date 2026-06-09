import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { job: { groupBy: (...a: unknown[]) => groupBy(...a), findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/lib/jobs/filters", () => ({ buildJobWhere: () => ({ source: "ats" }) }));

import { getCompanyFeedPage, COMPANIES_PER_PAGE } from "./grouped";

beforeEach(() => { groupBy.mockReset(); findMany.mockReset(); });

describe("getCompanyFeedPage", () => {
  it("returns groups with totalCount and top-2 roles, hasMore=false", async () => {
    groupBy.mockResolvedValue([
      { company: "Stripe", _count: { _all: 12 }, _max: { postedAt: new Date(), salaryMax: 200000 } },
      { company: "Vercel", _count: { _all: 3 }, _max: { postedAt: new Date(), salaryMax: 180000 } },
    ]);
    findMany.mockImplementation(({ where }: { where: { AND: Array<{ company?: string }> } }) => {
      const company = where.AND[1].company;
      return Promise.resolve([{ id: company + "-1" }, { id: company + "-2" }]);
    });
    const res = await getCompanyFeedPage({}, "u1", 0);
    expect(res.hasMore).toBe(false);
    expect(res.groups).toHaveLength(2);
    expect(res.groups[0]).toMatchObject({ company: "Stripe", totalCount: 12 });
    expect(res.groups[0].topRoles).toHaveLength(2);
  });

  it("sets hasMore=true when groupBy returns more than a page", async () => {
    const many = Array.from({ length: COMPANIES_PER_PAGE + 1 }, (_, i) => ({
      company: "C" + i, _count: { _all: 1 }, _max: { postedAt: new Date(), salaryMax: 1 },
    }));
    groupBy.mockResolvedValue(many);
    findMany.mockResolvedValue([{ id: "x" }]);
    const res = await getCompanyFeedPage({}, "u1", 0);
    expect(res.hasMore).toBe(true);
    expect(res.groups).toHaveLength(COMPANIES_PER_PAGE);
  });
});
