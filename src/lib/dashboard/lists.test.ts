import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { findMany: (...a: any) => findMany(...a) } },
}));

import { getInterviewing, getSavedNotApplied } from "@/lib/dashboard/lists";

const row = (id: string, title: string, company: string, url: string | null = null) => ({
  id,
  updatedAt: new Date("2026-06-09T10:00:00Z"),
  title,
  company,
  url,
});

beforeEach(() => {
  findMany.mockReset();
});

describe("getInterviewing", () => {
  it("queries status=interviewing, scoped to user, include job, orderBy updatedAt desc, take 8", async () => {
    findMany.mockResolvedValueOnce([row("a1", "SWE", "Acme")]);
    await getInterviewing("u1");
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1", status: "interviewing" });
    expect(args.include).toBeUndefined();
    expect(args.orderBy).toEqual({ updatedAt: "desc" });
    expect(args.take).toBe(8);
  });

  it("maps to {id, jobTitle, company, updatedAt}", async () => {
    findMany.mockResolvedValueOnce([row("a1", "SWE", "Acme")]);
    const result = await getInterviewing("u1");
    expect(result[0]).toEqual({
      id: "a1",
      jobTitle: "SWE",
      company: "Acme",
      updatedAt: new Date("2026-06-09T10:00:00Z"),
    });
  });
});

describe("getSavedNotApplied", () => {
  it("queries status=saved, scoped to user, orderBy updatedAt desc, take 8", async () => {
    findMany.mockResolvedValueOnce([row("s1", "PM", "Beta", "https://x.co")]);
    await getSavedNotApplied("u1");
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1", status: "saved" });
    expect(args.include).toBeUndefined();
    expect(args.orderBy).toEqual({ updatedAt: "desc" });
    expect(args.take).toBe(8);
  });

  it("maps to {id, jobTitle, company, url}", async () => {
    findMany.mockResolvedValueOnce([row("s1", "PM", "Beta", "https://x.co")]);
    const result = await getSavedNotApplied("u1");
    expect(result[0]).toEqual({
      id: "s1",
      jobTitle: "PM",
      company: "Beta",
      url: "https://x.co",
    });
  });
});
