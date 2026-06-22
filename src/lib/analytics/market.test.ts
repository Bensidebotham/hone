import { describe, it, expect, vi, beforeEach } from "vitest";

const queryRaw = vi.fn();
const groupBy = vi.fn();
const count = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...a: any) => queryRaw(...a),
    job: {
      groupBy: (...a: any) => groupBy(...a),
      count: (...a: any) => count(...a),
    },
  },
}));

import { fillWeeks, getRemoteSplit } from "@/lib/analytics/market";

describe("fillWeeks", () => {
  it("produces 12 contiguous Monday buckets, zero-filled, oldest first", () => {
    const out = fillWeeks([], 12);
    expect(out).toHaveLength(12);
    // each weekStart is a Monday (yyyy-mm-dd)
    for (const p of out) {
      expect(new Date(p.weekStart + "T00:00:00").getDay()).toBe(1);
      expect(p.count).toBe(0);
    }
    // ascending
    expect(out[0].weekStart < out[11].weekStart).toBe(true);
  });

  it("maps raw rows onto the matching week bucket", () => {
    const all = fillWeeks([], 12);
    const wk = all[5].weekStart;
    const out = fillWeeks([{ week: new Date(wk + "T00:00:00"), count: BigInt(7) }], 12);
    expect(out[5].count).toBe(7); // BigInt coerced to number
  });
});

describe("getRemoteSplit", () => {
  beforeEach(() => groupBy.mockReset());
  it("splits active global jobs by isRemote", async () => {
    groupBy.mockResolvedValue([
      { isRemote: true, _count: { _all: 4 } },
      { isRemote: false, _count: { _all: 6 } },
    ]);
    const r = await getRemoteSplit();
    expect(r).toEqual({ remote: 4, onsite: 6 });
    const where = groupBy.mock.calls[0][0].where;
    expect(where.userId).toBeNull();
    expect(where.active).toBe(true);
  });
});
