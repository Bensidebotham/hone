"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordApplicationEvent } from "@/lib/applications/events";

type Status = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export async function addApplication(jobId: string) {
  const user = await requireUser();
  const app = await prisma.application.create({
    data: { userId: user.id, jobId, status: "saved" },
  });
  await recordApplicationEvent({
    applicationId: app.id,
    userId: user.id,
    type: "created",
    toStatus: "saved",
  });
  revalidatePath("/applications");
}

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
      applicationId,
      userId: user.id,
      type: "status_change",
      fromStatus: current.status,
      toStatus: status,
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
      applicationId,
      userId: user.id,
      type: "status_change",
      fromStatus: current.status,
      toStatus: "applied",
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
  appliedAt?: Date | null;
  notes?: string;
}

/** Create a paste-source Job + a linked Application for a job the app never ingested. */
export async function createManualApplication(input: ManualApplicationInput) {
  const user = await requireUser();
  const company = input.company.trim();
  const title = input.title.trim();
  if (!company) throw new Error("Company is required.");
  if (!title) throw new Error("Role is required.");

  const appliedAt =
    input.appliedAt ?? (input.status !== "saved" ? new Date() : null);

  const job = await prisma.job.create({
    data: {
      userId: user.id,
      source: "paste",
      company,
      title,
      location: input.location?.trim() || null,
      url: input.url?.trim() || null,
      salary: input.salary?.trim() || null,
      descriptionText: "",
    },
  });

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      jobId: job.id,
      status: input.status,
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
}

/**
 * Update an application's own fields (notes, appliedAt). Job fields
 * (salary/location/url) are only editable for paste-source jobs — ats
 * postings are treated as immutable shared records.
 */
export async function updateApplicationDetails(
  applicationId: string,
  input: ApplicationDetailInput
) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    include: { job: true },
  });
  if (!app) return;

  await prisma.application.update({
    where: { id: app.id },
    data: {
      notes: input.notes ?? undefined,
      // Pass an explicit null through (clears the date); skip only when omitted.
      appliedAt: input.appliedAt === undefined ? undefined : input.appliedAt,
    },
  });

  if (app.job.source === "paste") {
    await prisma.job.update({
      where: { id: app.jobId },
      data: {
        // Only overwrite a field when the caller actually provided it,
        // so a partial update never wipes existing values.
        salary: input.salary !== undefined ? input.salary.trim() || null : undefined,
        location: input.location !== undefined ? input.location.trim() || null : undefined,
        url: input.url !== undefined ? input.url.trim() || null : undefined,
      },
    });
  }

  revalidatePath("/applications");
}

/** Delete an application; clean up its backing paste job if now orphaned. */
export async function deleteApplication(applicationId: string) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    include: { job: true },
  });
  if (!app) return;

  await prisma.application.delete({ where: { id: app.id } });

  if (app.job.source === "paste") {
    const remaining = await prisma.application.count({ where: { jobId: app.jobId } });
    if (remaining === 0) {
      await prisma.job.delete({ where: { id: app.jobId } });
    }
  }

  revalidatePath("/applications");
}
