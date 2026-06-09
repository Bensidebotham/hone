"use client";

import { useOptimistic, useTransition } from "react";
import type { ResumeGoal } from "@prisma/client";
import { setGoalCompletion } from "@/lib/resume/goal-actions";
import { groupGoalsByPriority, goalProgress } from "@/lib/resume/goals-view";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";

interface ResumeGoalsProps {
  resumeId: string;
  goals: ResumeGoal[];
}

export function ResumeGoals({ resumeId, goals }: ResumeGoalsProps) {
  const [optimistic, setOptimistic] = useOptimistic(
    goals,
    (state: ResumeGoal[], update: { id: string; completed: boolean }) =>
      state.map((g) =>
        g.id === update.id
          ? { ...g, completedAt: update.completed ? new Date() : null }
          : g
      )
  );

  const [, startTransition] = useTransition();

  function onToggle(id: string, completed: boolean) {
    startTransition(async () => {
      setOptimistic({ id, completed });
      await setGoalCompletion(id, resumeId, completed);
    });
  }

  if (optimistic.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No goals yet.</p>
    );
  }

  const { completed, total } = goalProgress(optimistic);
  const percentValue = total === 0 ? 0 : Math.round((completed / total) * 100);

  const groups = groupGoalsByPriority(optimistic);

  const sections: { key: "high" | "medium" | "low"; label: string }[] = [
    { key: "high", label: "High Priority" },
    { key: "medium", label: "Medium Priority" },
    { key: "low", label: "Low Priority" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Progress value={percentValue} aria-label="Goals completion progress">
        <ProgressLabel>Goals</ProgressLabel>
        <ProgressValue>{() => `${completed} / ${total} completed`}</ProgressValue>
      </Progress>

      <Accordion defaultValue={["high", "medium", "low"]}>
        {sections
          .filter(({ key }) => groups[key].length > 0)
          .map(({ key, label }) => (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger>{label}</AccordionTrigger>
              <AccordionContent>
                <ul className="flex flex-col gap-2">
                  {groups[key].map((goal) => {
                    const isDone = goal.completedAt !== null;
                    const checkboxId = `goal-${goal.id}`;
                    return (
                      <li key={goal.id} className="flex items-start gap-2">
                        <Checkbox
                          id={checkboxId}
                          checked={isDone}
                          onCheckedChange={(newChecked) => {
                            onToggle(goal.id, newChecked);
                          }}
                          aria-label={goal.suggestionText}
                        />
                        <label
                          htmlFor={checkboxId}
                          className={
                            isDone
                              ? "cursor-pointer text-sm line-through text-muted-foreground"
                              : "cursor-pointer text-sm"
                          }
                        >
                          {goal.suggestionText}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
    </div>
  );
}
