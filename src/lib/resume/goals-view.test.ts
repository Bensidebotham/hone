import { describe, it, expect } from "vitest";
import { groupGoalsByPriority, goalProgress } from "./goals-view";
import type { ResumeGoal } from "@prisma/client";

function makeGoal(overrides: Partial<ResumeGoal>): ResumeGoal {
  return {
    id: "g1",
    userId: "u1",
    resumeId: "r1",
    suggestionText: "Some suggestion",
    priority: null,
    completedAt: null,
    createdAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("groupGoalsByPriority", () => {
  it("separates goals into high/medium/low buckets", () => {
    const goals = [
      makeGoal({ id: "g1", priority: "high" }),
      makeGoal({ id: "g2", priority: "medium" }),
      makeGoal({ id: "g3", priority: "low" }),
    ];
    const groups = groupGoalsByPriority(goals);
    expect(groups.high).toHaveLength(1);
    expect(groups.medium).toHaveLength(1);
    expect(groups.low).toHaveLength(1);
    expect(groups.high[0].id).toBe("g1");
    expect(groups.medium[0].id).toBe("g2");
    expect(groups.low[0].id).toBe("g3");
  });

  it("puts null priority into low bucket", () => {
    const goals = [makeGoal({ id: "g1", priority: null })];
    const groups = groupGoalsByPriority(goals);
    expect(groups.low).toHaveLength(1);
    expect(groups.high).toHaveLength(0);
    expect(groups.medium).toHaveLength(0);
  });

  it("puts unknown priority string into low bucket", () => {
    const goals = [makeGoal({ id: "g1", priority: "urgent" })];
    const groups = groupGoalsByPriority(goals);
    expect(groups.low).toHaveLength(1);
    expect(groups.high).toHaveLength(0);
    expect(groups.medium).toHaveLength(0);
  });

  it("returns empty buckets for empty input", () => {
    const groups = groupGoalsByPriority([]);
    expect(groups.high).toHaveLength(0);
    expect(groups.medium).toHaveLength(0);
    expect(groups.low).toHaveLength(0);
  });

  it("preserves order within a bucket", () => {
    const goals = [
      makeGoal({ id: "g3", priority: "high", createdAt: new Date("2024-01-03") }),
      makeGoal({ id: "g1", priority: "high", createdAt: new Date("2024-01-01") }),
      makeGoal({ id: "g2", priority: "high", createdAt: new Date("2024-01-02") }),
    ];
    const groups = groupGoalsByPriority(goals);
    expect(groups.high.map((g) => g.id)).toEqual(["g3", "g1", "g2"]);
  });
});

describe("goalProgress", () => {
  it("returns 0/0 for empty list", () => {
    expect(goalProgress([])).toEqual({ completed: 0, total: 0 });
  });

  it("counts completed goals (completedAt not null)", () => {
    const goals = [
      makeGoal({ id: "g1", completedAt: new Date() }),
      makeGoal({ id: "g2", completedAt: null }),
      makeGoal({ id: "g3", completedAt: new Date() }),
    ];
    expect(goalProgress(goals)).toEqual({ completed: 2, total: 3 });
  });

  it("counts zero completed when none are done", () => {
    const goals = [
      makeGoal({ id: "g1", completedAt: null }),
      makeGoal({ id: "g2", completedAt: null }),
    ];
    expect(goalProgress(goals)).toEqual({ completed: 0, total: 2 });
  });

  it("counts all completed when all are done", () => {
    const goals = [
      makeGoal({ id: "g1", completedAt: new Date() }),
      makeGoal({ id: "g2", completedAt: new Date() }),
    ];
    expect(goalProgress(goals)).toEqual({ completed: 2, total: 2 });
  });
});
