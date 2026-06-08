import { describe, it, expect, vi, beforeEach } from "vitest";
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    userSavedJob: {
      findMany: (...a: any) => findMany(...a),
    },
  },
}));
import { listSavedJobIds } from "@/lib/jobs/saved-queries";

describe("listSavedJobIds", () => {
  beforeEach(() => {
    findMany.mockClear();
  });

  it("returns a Set of jobIds for the given userId", async () => {
    findMany.mockResolvedValue([
      { jobId: "j1" },
      { jobId: "j2" },
      { jobId: "j3" },
    ]);

    const result = await listSavedJobIds("u1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      select: { jobId: true },
    });
    expect(result).toBeInstanceOf(Set);
    expect(result).toEqual(new Set(["j1", "j2", "j3"]));
  });

  it("returns an empty Set when user has no saved jobs", async () => {
    findMany.mockResolvedValue([]);

    const result = await listSavedJobIds("u1");

    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });
});
