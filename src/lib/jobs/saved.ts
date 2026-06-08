"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function toggleSavedJob(jobId: string): Promise<void> {
  const user = await requireUser();
  const existing = await prisma.userSavedJob.findUnique({
    where: { userId_jobId: { userId: user.id, jobId } },
  });
  if (existing) {
    await prisma.userSavedJob.delete({
      where: { userId_jobId: { userId: user.id, jobId } },
    });
  } else {
    await prisma.userSavedJob.create({
      data: { userId: user.id, jobId },
    });
  }
  revalidatePath("/jobs");
}
