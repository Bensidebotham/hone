"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordApplicationEvent } from "@/lib/applications/events";

type Status = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export async function updateStatus(applicationId: string, status: Status) {
  const user = await requireUser();
  const current = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { status: true },
  });
  if (!current) return;
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { status, appliedAt: status === "applied" ? new Date() : undefined },
  });
  if (current.status !== status) {
    await recordApplicationEvent({
      applicationId, userId: user.id, type: "status_change",
      fromStatus: current.status, toStatus: status,
    });
  }
  revalidatePath("/applications");
}

/** Set status to Applied and stamp the applied date to now (always overwrites). */
export async function markAppliedToday(applicationId: string) {
  const user = await requireUser();
  const current = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { status: true },
  });
  if (!current) return;
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { status: "applied", appliedAt: new Date() },
  });
  if (current.status !== "applied") {
    await recordApplicationEvent({
      applicationId, userId: user.id, type: "status_change",
      fromStatus: current.status, toStatus: "applied",
    });
  }
  revalidatePath("/applications");
}

export async function updateNotes(applicationId: string, notes: string) {
  const user = await requireUser();
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { notes },
  });
  revalidatePath("/applications");
}

export interface ManualApplicationInput {
  company: string;
  title: string;
  status: Status;
  url?: string;
  salary?: string;
  location?: string;
  description?: string;
  appliedAt?: Date | null;
  notes?: string;
}

/** Create a standalone application for a role tracked anywhere. */
export async function createManualApplication(input: ManualApplicationInput) {
  const user = await requireUser();
  const company = input.company.trim();
  const title = input.title.trim();
  if (!company) throw new Error("Company is required.");
  if (!title) throw new Error("Role is required.");

  const appliedAt =
    input.appliedAt ?? (input.status !== "saved" ? new Date() : null);

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      company,
      title,
      status: input.status,
      url: input.url?.trim() || null,
      salary: input.salary?.trim() || null,
      location: input.location?.trim() || null,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      appliedAt,
    },
  });

  await recordApplicationEvent({
    applicationId: application.id,
    userId: user.id,
    type: "created",
    toStatus: input.status,
  });

  revalidatePath("/applications");
}

export interface ApplicationDetailInput {
  notes?: string;
  appliedAt?: Date | null;
  salary?: string;
  location?: string;
  url?: string;
  description?: string;
}

/** Update an application's own fields. All fields live on Application now. */
export async function updateApplicationDetails(
  applicationId: string,
  input: ApplicationDetailInput
) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { id: true },
  });
  if (!app) return;

  await prisma.application.update({
    where: { id: app.id },
    data: {
      notes: input.notes ?? undefined,
      appliedAt: input.appliedAt === undefined ? undefined : input.appliedAt,
      salary: input.salary !== undefined ? input.salary.trim() || null : undefined,
      location: input.location !== undefined ? input.location.trim() || null : undefined,
      url: input.url !== undefined ? input.url.trim() || null : undefined,
      description: input.description !== undefined ? input.description.trim() || null : undefined,
    },
  });

  revalidatePath("/applications");
}

/** Delete an application. */
export async function deleteApplication(applicationId: string) {
  const user = await requireUser();
  await prisma.application.deleteMany({
    where: { id: applicationId, userId: user.id },
  });
  revalidatePath("/applications");
}
