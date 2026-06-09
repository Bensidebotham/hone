import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
const upsert = vi.fn().mockResolvedValue({});
const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/db", () => ({
  prisma: {
    resumeGoal: {
      upsert: (...a: any) => upsert(...a),
      findMany: (...a: any) => findMany(...a),
    },
  },
}));
import { syncGoalsFromAnalysis, listGoals } from "@/lib/resume/goals";

describe("syncGoalsFromAnalysis", () => {
  beforeEach(() => { upsert.mockClear(); findMany.mockClear(); });

  it("calls upsert once per suggestion with correct where/create/update", async () => {
    const suggestions = [
      { priority: "high" as const, text: "Add quantified achievements" },
      { priority: "low" as const, text: "Include a summary section" },
    ];
    await syncGoalsFromAnalysis("r1", suggestions);

    expect(upsert).toHaveBeenCalledTimes(2);

    expect(upsert).toHaveBeenCalledWith({
      where: { resumeId_suggestionText: { resumeId: "r1", suggestionText: "Add quantified achievements" } },
      create: { userId: "u1", resumeId: "r1", suggestionText: "Add quantified achievements", priority: "high" },
      update: { priority: "high" },
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { resumeId_suggestionText: { resumeId: "r1", suggestionText: "Include a summary section" } },
      create: { userId: "u1", resumeId: "r1", suggestionText: "Include a summary section", priority: "low" },
      update: { priority: "low" },
    });
  });

  it("update branch does NOT include completedAt", async () => {
    await syncGoalsFromAnalysis("r1", [{ priority: "medium" as const, text: "Fix formatting" }]);

    const call = upsert.mock.calls[0][0];
    expect(call.update).not.toHaveProperty("completedAt");
  });

  it("uses resumeId_suggestionText compound key in where clause (idempotent constraint)", async () => {
    await syncGoalsFromAnalysis("r1", [{ priority: "high" as const, text: "Some suggestion" }]);

    const call = upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      resumeId_suggestionText: { resumeId: "r1", suggestionText: "Some suggestion" },
    });
  });
});

describe("listGoals", () => {
  beforeEach(() => { upsert.mockClear(); findMany.mockClear(); });

  it("calls findMany scoped to the user and resumeId, ordered by createdAt asc", async () => {
    findMany.mockResolvedValue([{ id: "g1", suggestionText: "Improve formatting" }]);

    const result = await listGoals("r1");

    expect(findMany).toHaveBeenCalledWith({
      where: { resumeId: "r1", userId: "u1" },
      orderBy: { createdAt: "asc" },
    });
    expect(result).toEqual([{ id: "g1", suggestionText: "Improve formatting" }]);
  });
});
