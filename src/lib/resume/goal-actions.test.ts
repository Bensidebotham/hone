import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const updateMany = vi.fn().mockResolvedValue({ count: 1 });
vi.mock("@/lib/db", () => ({
  prisma: {
    resumeGoal: {
      updateMany: (...a: any) => updateMany(...a),
    },
  },
}));
import { setGoalCompletion } from "@/lib/resume/goal-actions";
import { revalidatePath } from "next/cache";

describe("setGoalCompletion", () => {
  beforeEach(() => {
    updateMany.mockClear();
    vi.mocked(revalidatePath).mockClear();
  });

  it("marks goal complete when completed=true: updateMany with a Date", async () => {
    await setGoalCompletion("g1", "r1", true);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1", userId: "u1" },
        data: expect.objectContaining({ completedAt: expect.any(Date) }),
      })
    );
  });

  it("marks goal incomplete when completed=false: updateMany with null", async () => {
    await setGoalCompletion("g1", "r1", false);

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "g1", userId: "u1" },
        data: { completedAt: null },
      })
    );
  });

  it("always scopes where clause to userId (ownership enforcement)", async () => {
    await setGoalCompletion("g1", "r1", true);

    const call = updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "g1", userId: "u1" });
  });

  it("calls revalidatePath with /resume/<resumeId>", async () => {
    await setGoalCompletion("g1", "r42", true);

    expect(revalidatePath).toHaveBeenCalledWith("/resume/r42");
  });
});
