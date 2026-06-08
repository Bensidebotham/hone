"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Status = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export async function addApplication(jobId: string) {
  const user = await requireUser();
  await prisma.application.create({ data: { userId: user.id, jobId, status: "saved" } });
  revalidatePath("/applications");
}

export async function updateStatus(applicationId: string, status: Status) {
  const user = await requireUser();
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { status, appliedAt: status === "applied" ? new Date() : undefined },
  });
  revalidatePath("/applications");
}

export async function updateNotes(applicationId: string, notes: string) {
  const user = await requireUser();
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id }, data: { notes },
  });
  revalidatePath("/applications");
}
