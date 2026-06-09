import { describe, it, expect } from "vitest";
import { buildJobWhere } from "./filters";

const USER = "user_1";

describe("buildJobWhere", () => {
  it("always restricts to ATS + (US or remote)", () => {
    const where = buildJobWhere({}, USER);
    expect(where).toMatchObject({
      source: "ats",
      OR: [{ country: "US" }, { isRemote: true }],
    });
  });

  it("adds a keyword OR across title and company", () => {
    const where = buildJobWhere({ q: "react" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { title: { contains: "react", mode: "insensitive" } },
        { company: { contains: "react", mode: "insensitive" } },
      ],
    });
  });

  it("filters by roleCategory and level", () => {
    const where = buildJobWhere({ roleCategory: "frontend", level: "senior" }, USER);
    expect(where.AND).toContainEqual({ roleCategory: "frontend" });
    expect(where.AND).toContainEqual({ level: "senior" });
  });

  it("filters by any of the requested tech tags", () => {
    const where = buildJobWhere({ techTags: "React,Go" }, USER);
    expect(where.AND).toContainEqual({ techTags: { hasSome: ["React", "Go"] } });
  });

  it("filters by minimum salary, excluding undisclosed", () => {
    const where = buildJobWhere({ salaryMin: "150000" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { salaryMax: { gte: 150000 } },
        { AND: [{ salaryMax: null }, { salaryMin: { gte: 150000 } }] },
      ],
    });
  });

  it("ignores an unparseable salaryMin", () => {
    const where = buildJobWhere({ salaryMin: "abc" }, USER);
    expect(where).not.toHaveProperty("AND");
  });
});
