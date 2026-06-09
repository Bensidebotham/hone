"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function toggleGoal(goalId: string, resumeId: string): Promise<void> {
  const user = await requireUser();
  const goal = await prisma.resumeGoal.findFirst({ where: { id: goalId, userId: user.id } });
  if (!goal) return;
  await prisma.resumeGoal.updateMany({
    where: { id: goalId, userId: user.id },
    data: { completedAt: goal.completedAt ? null : new Date() },
  });
  revalidatePath(`/resume/${resumeId}`);
}
