import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const create = vi.fn().mockResolvedValue({ id: "app1" });
const updateMany = vi.fn().mockResolvedValue({ count: 1 });
vi.mock("@/lib/db", () => ({ prisma: { application: {
  create: (...a: any) => create(...a),
  updateMany: (...a: any) => updateMany(...a),
} } }));
import { addApplication, updateStatus } from "@/lib/applications/actions";

describe("application actions", () => {
  beforeEach(() => { create.mockClear(); updateMany.mockClear(); });
  it("addApplication creates a saved app for the user", async () => {
    await addApplication("j1");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "u1", jobId: "j1", status: "saved" }),
    }));
  });
  it("updateStatus scopes update to the user (ownership)", async () => {
    await updateStatus("app1", "applied");
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "app1", userId: "u1" },
      data: expect.objectContaining({ status: "applied" }),
    }));
  });
});
