import type { ResumeGoal } from "@prisma/client";

export interface GoalGroups {
  high: ResumeGoal[];
  medium: ResumeGoal[];
  low: ResumeGoal[];
}

export interface GoalProgress {
  completed: number;
  total: number;
}

/**
 * Groups goals by priority. Goals with null or unrecognised priority
 * fall into the "low" bucket.
 */
export function groupGoalsByPriority(goals: ResumeGoal[]): GoalGroups {
  const groups: GoalGroups = { high: [], medium: [], low: [] };
  for (const goal of goals) {
    if (goal.priority === "high") {
      groups.high.push(goal);
    } else if (goal.priority === "medium") {
      groups.medium.push(goal);
    } else {
      groups.low.push(goal);
    }
  }
  return groups;
}

/** Returns the number of completed goals and the total count. */
export function goalProgress(goals: ResumeGoal[]): GoalProgress {
  const total = goals.length;
  const completed = goals.filter((g) => g.completedAt !== null).length;
  return { completed, total };
}
