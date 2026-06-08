import { describe, it, expect } from "vitest";
import { buildJobWhere } from "@/lib/jobs/filters";

const BASE_OR = [{ source: "ats" }, { userId: "u1" }];

describe("buildJobWhere", () => {
  it("returns only base OR when no params given", () => {
    const result = buildJobWhere({}, "u1");
    expect(result).toEqual({ OR: BASE_OR });
    expect(result).not.toHaveProperty("AND");
  });

  it("adds location contains filter for location param", () => {
    const result = buildJobWhere({ location: "London" }, "u1");
    expect(result.OR).toEqual(BASE_OR);
    expect(result.AND).toContainEqual({
      location: { contains: "London", mode: "insensitive" },
    });
  });

  it("adds company contains filter for company param", () => {
    const result = buildJobWhere({ company: "Stripe" }, "u1");
    expect(result.OR).toEqual(BASE_OR);
    expect(result.AND).toContainEqual({
      company: { contains: "Stripe", mode: "insensitive" },
    });
  });

  it("adds remote location filter when remote is 'true'", () => {
    const result = buildJobWhere({ remote: "true" }, "u1");
    expect(result.OR).toEqual(BASE_OR);
    expect(result.AND).toContainEqual({
      location: { contains: "remote", mode: "insensitive" },
    });
  });

  it("adds postedAt gte filter for postedWithin '7d'", () => {
    const before = new Date();
    const result = buildJobWhere({ postedWithin: "7d" }, "u1");
    const after = new Date();

    expect(result.OR).toEqual(BASE_OR);
    const andArr = result.AND as any[];
    const dateCondition = andArr.find((c) => c.postedAt);
    expect(dateCondition).toBeDefined();

    const gte = dateCondition.postedAt.gte as Date;
    expect(gte).toBeInstanceOf(Date);

    // gte should be approximately now - 7 days, within a ±1 day window around 7-days-ago
    const eightDaysAgo = new Date(before.getTime() - 8 * 24 * 60 * 60 * 1000);
    const sixDaysAgo = new Date(after.getTime() - 6 * 24 * 60 * 60 * 1000);
    expect(gte.getTime()).toBeGreaterThan(eightDaysAgo.getTime());
    expect(gte.getTime()).toBeLessThan(sixDaysAgo.getTime());
  });

  it("stacks multiple params under AND with base OR always present", () => {
    const result = buildJobWhere(
      { location: "NYC", company: "Acme", remote: "false" },
      "u1"
    );
    expect(result.OR).toEqual(BASE_OR);
    const andArr = result.AND as any[];
    expect(andArr).toContainEqual({
      location: { contains: "NYC", mode: "insensitive" },
    });
    expect(andArr).toContainEqual({
      company: { contains: "Acme", mode: "insensitive" },
    });
    // remote: "false" should NOT add a remote location filter
    expect(andArr).not.toContainEqual({
      location: { contains: "remote", mode: "insensitive" },
    });
  });

  it("ignores invalid postedWithin value 'abc' — no postedAt filter, no AND", () => {
    const result = buildJobWhere({ postedWithin: "abc" }, "u1");
    expect(result).toEqual({ OR: BASE_OR });
    expect(result).not.toHaveProperty("AND");
  });

  it("ignores postedWithin '0d' — no postedAt filter, no AND", () => {
    const result = buildJobWhere({ postedWithin: "0d" }, "u1");
    expect(result).toEqual({ OR: BASE_OR });
    expect(result).not.toHaveProperty("AND");
  });

  it("ignores empty string values", () => {
    const result = buildJobWhere({ location: "", company: "" }, "u1");
    expect(result).toEqual({ OR: BASE_OR });
    expect(result).not.toHaveProperty("AND");
  });

  it("ignores unknown params", () => {
    const result = buildJobWhere({ unknownParam: "foo" }, "u1");
    expect(result).toEqual({ OR: BASE_OR });
    expect(result).not.toHaveProperty("AND");
  });
});
