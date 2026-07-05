import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { tailoring: { findMany: (...a: any) => findMany(...a), findFirst: (...a: any) => findFirst(...a) } },
}));

import { getTailorings, getTailoredApplicationIds, getTailoring } from "./tailorings";

beforeEach(() => vi.clearAllMocks());

it("getTailorings queries newest-first scoped to the user", async () => {
  findMany.mockResolvedValue([{ id: "t1", company: "Stripe", jobTitle: "SWE", fitScore: 80, createdAt: new Date(0), applicationId: "a1" }]);
  const out = await getTailorings("u1");
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" }, orderBy: { createdAt: "desc" } }));
  expect(out[0].id).toBe("t1");
});

it("getTailoredApplicationIds returns a Set of non-null application ids", async () => {
  findMany.mockResolvedValue([{ applicationId: "a1" }, { applicationId: "a2" }]);
  const set = await getTailoredApplicationIds("u1");
  expect(set.has("a1")).toBe(true);
  expect(set.has("a2")).toBe(true);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", applicationId: { not: null } } }));
});

it("getTailoring flattens the stored result JSON, or null when not found", async () => {
  findFirst.mockResolvedValue(null);
  expect(await getTailoring("u1", "nope")).toBeNull();
  findFirst.mockResolvedValue({
    id: "t1", jobDescription: "JD", company: "Stripe", jobTitle: "SWE",
    result: { fitScore: 80, summary: "s", keywordGaps: [], tailoredBullets: [], skillsToFeature: [], strengths: [], gaps: [] },
  });
  const out = await getTailoring("u1", "t1");
  expect(out).toEqual(expect.objectContaining({ id: "t1", jobDescription: "JD", fitScore: 80, summary: "s" }));
});
