import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const findUnique = vi.fn();
const deleteFn = vi.fn();
const createFn = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    userSavedJob: {
      findUnique: (...a: any) => findUnique(...a),
      delete: (...a: any) => deleteFn(...a),
      create: (...a: any) => createFn(...a),
    },
  },
}));
import { toggleSavedJob } from "@/lib/jobs/saved";
import { revalidatePath } from "next/cache";

describe("toggleSavedJob", () => {
  beforeEach(() => {
    findUnique.mockClear();
    deleteFn.mockClear();
    createFn.mockClear();
    vi.mocked(revalidatePath).mockClear();
  });

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
