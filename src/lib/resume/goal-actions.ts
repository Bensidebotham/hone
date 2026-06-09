"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function setGoalCompletion(
  goalId: string,
  resumeId: string,
  completed: boolean,
): Promise<void> {
  const user = await requireUser();
  await prisma.resumeGoal.updateMany({
    where: { id: goalId, userId: user.id },
    data: { completedAt: completed ? new Date() : null },
  });
  revalidatePath(`/resume/${resumeId}`);
}
