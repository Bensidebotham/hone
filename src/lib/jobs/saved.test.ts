import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const findUnique = vi.fn();
const deleteFn = vi.fn();
const createFn = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    userSavedJob: {
      findUnique: (...a: any) => findUnique(...a),
      delete: (...a: any) => deleteFn(...a),
      create: (...a: any) => createFn(...a),
      findMany: (...a: any) => findMany(...a),
    },
  },
}));
import { toggleSavedJob, listSavedJobIds } from "@/lib/jobs/saved";
import { revalidatePath } from "next/cache";

describe("saved job service", () => {
  beforeEach(() => {
    findUnique.mockClear();
    deleteFn.mockClear();
    createFn.mockClear();
    findMany.mockClear();
    vi.mocked(revalidatePath).mockClear();
  });

  describe("toggleSavedJob", () => {
    it("creates a saved job when none exists", async () => {
      findUnique.mockResolvedValue(null);
      createFn.mockResolvedValue({ userId: "u1", jobId: "j1" });

      await toggleSavedJob("j1");

      expect(findUnique).toHaveBeenCalledWith({
        where: { userId_jobId: { userId: "u1", jobId: "j1" } },
      });
      expect(createFn).toHaveBeenCalledWith({
        data: { userId: "u1", jobId: "j1" },
      });
      expect(deleteFn).not.toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    });

    it("deletes a saved job when one already exists", async () => {
      findUnique.mockResolvedValue({ userId: "u1", jobId: "j1" });
      deleteFn.mockResolvedValue({ userId: "u1", jobId: "j1" });

      await toggleSavedJob("j1");

      expect(findUnique).toHaveBeenCalledWith({
        where: { userId_jobId: { userId: "u1", jobId: "j1" } },
      });
      expect(deleteFn).toHaveBeenCalledWith({
        where: { userId_jobId: { userId: "u1", jobId: "j1" } },
      });
      expect(createFn).not.toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    });
  });

  describe("listSavedJobIds", () => {
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
});
