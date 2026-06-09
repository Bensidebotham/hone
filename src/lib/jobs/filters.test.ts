import { describe, it, expect } from "vitest";
import { buildJobWhere } from "./filters";

const USER = "user_1";

describe("buildJobWhere", () => {
  it("base: ATS + CS + (US or ambiguous-remote), foreign dropped", () => {
    const where = buildJobWhere({}, USER);
    expect(where).toMatchObject({
      source: "ats",
      roleCategory: { in: expect.arrayContaining(["frontend", "backend"]) },
      OR: [{ country: "US" }, { AND: [{ isRemote: true }, { country: null }] }],
    });
  });

  it("defaults to entry-level (junior) when no level param", () => {
    const where = buildJobWhere({}, USER);
    expect(where.AND).toContainEqual({ level: "junior" });
  });

  it("level=all removes the level filter", () => {
    const where = buildJobWhere({ level: "all" }, USER);
    const conds = (where.AND as Array<Record<string, unknown>>) ?? [];
    expect(conds.some((c) => "level" in c)).toBe(false);
  });

  it("level=senior filters senior", () => {
    const where = buildJobWhere({ level: "senior" }, USER);
    expect(where.AND).toContainEqual({ level: "senior" });
  });

  it("keyword search across title and company still works", () => {
    const where = buildJobWhere({ q: "react" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { title: { contains: "react", mode: "insensitive" } },
        { company: { contains: "react", mode: "insensitive" } },
      ],
    });
  });

  it("salaryMin floor with undisclosed-exclusion", () => {
    const where = buildJobWhere({ salaryMin: "150000" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { salaryMax: { gte: 150000 } },
        { AND: [{ salaryMax: null }, { salaryMin: { gte: 150000 } }] },
      ],
    });
  });
});
