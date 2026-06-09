import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const findFirst = vi.fn();
const updateMany = vi.fn().mockResolvedValue({ count: 1 });
vi.mock("@/lib/db", () => ({
  prisma: {
    resumeGoal: {
      findFirst: (...a: any) => findFirst(...a),
      updateMany: (...a: any) => updateMany(...a),
    },
  },
}));
import { toggleGoal } from "@/lib/resume/goal-actions";
import { revalidatePath } from "next/cache";

describe("toggleGoal", () => {
  beforeEach(() => {
    findFirst.mockClear();
    updateMany.mockClear();
    vi.mocked(revalidatePath).mockClear();
  });

  it("marks goal complete (null → Date) when completedAt is null", async () => {
    findFirst.mockResolvedValue({ id: "g1", userId: "u1", completedAt: null });

    await toggleGoal("g1", "r1");

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1", userId: "u1" },
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      })
    );
  });

  it("marks goal incomplete (Date → null) when completedAt is set", async () => {
    findFirst.mockResolvedValue({ id: "g1", userId: "u1", completedAt: new Date("2026-01-01") });

    await toggleGoal("g1", "r1");

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1", userId: "u1" },
        data: { completedAt: null },
      })
    );
  });

  it("scopes findFirst ownership to userId", async () => {
    findFirst.mockResolvedValue({ id: "g1", userId: "u1", completedAt: null });

    await toggleGoal("g1", "r1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "g1", userId: "u1" },
    });
  });

  it("does NOT call updateMany if goal not found (ownership enforcement)", async () => {
    findFirst.mockResolvedValue(null);

    await toggleGoal("g1", "r1");

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("calls revalidatePath with /resume/<resumeId>", async () => {
    findFirst.mockResolvedValue({ id: "g1", userId: "u1", completedAt: null });

    await toggleGoal("g1", "r42");

    expect(revalidatePath).toHaveBeenCalledWith("/resume/r42");
  });
});
