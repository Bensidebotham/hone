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
export async function createManualApplication(input: ManualApplicationInput): Promise<string> {
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
  return application.id;
}

export interface ApplicationFieldsInput {
  company?: string;
  title?: string;
  salary?: string;
  location?: string;
  url?: string;
  source?: string;
  contact?: string;
  nextStep?: string;
  notes?: string;
  description?: string;
  appliedAt?: Date | null;
  followUpDate?: Date | null;
}

const trimOrNull = (v?: string) => (v === undefined ? undefined : v.trim() || null);
// Required fields: never blank them via inline edit — skip an empty value.
const keepIfNonEmpty = (v?: string) => (v === undefined ? undefined : v.trim() || undefined);

/** Partial update of an application's own scalar fields. Omitted fields are untouched. */
export async function updateApplicationFields(applicationId: string, input: ApplicationFieldsInput) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { id: true },
  });
  if (!app) return;

  await prisma.application.update({
    where: { id: app.id },
    data: {
      company: keepIfNonEmpty(input.company),
      title: keepIfNonEmpty(input.title),
      salary: trimOrNull(input.salary),
      location: trimOrNull(input.location),
      url: trimOrNull(input.url),
      source: trimOrNull(input.source),
      contact: trimOrNull(input.contact),
      nextStep: trimOrNull(input.nextStep),
      notes: trimOrNull(input.notes),
      description: trimOrNull(input.description),
      appliedAt: input.appliedAt === undefined ? undefined : input.appliedAt,
      followUpDate: input.followUpDate === undefined ? undefined : input.followUpDate,
    },
  });

  revalidatePath("/applications");
}

/** Bulk status change; records an event per changed application. */
export async function bulkUpdateStatus(ids: string[], status: Status) {
  if (ids.length === 0) return;
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: { id: { in: ids }, userId: user.id },
    select: { id: true, status: true },
  });
  for (const app of apps) {
    if (app.status === status) continue;
    await prisma.application.update({
      where: { id: app.id },
      data: { status, appliedAt: status === "applied" ? new Date() : undefined },
    });
    await recordApplicationEvent({
      applicationId: app.id, userId: user.id, type: "status_change",
      fromStatus: app.status, toStatus: status,
    });
  }
  revalidatePath("/applications");
}

/** Bulk mark-applied; stamps the date and records events. */
export async function bulkMarkApplied(ids: string[]) {
  if (ids.length === 0) return;
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: { id: { in: ids }, userId: user.id },
    select: { id: true, status: true },
  });
  const now = new Date();
  for (const app of apps) {
    await prisma.application.update({
      where: { id: app.id },
      data: { status: "applied", appliedAt: now },
    });
    if (app.status !== "applied") {
      await recordApplicationEvent({
        applicationId: app.id, userId: user.id, type: "status_change",
        fromStatus: app.status, toStatus: "applied",
      });
    }
  }
  revalidatePath("/applications");
}

/** Bulk delete, scoped to the user. */
export async function bulkDelete(ids: string[]) {
  if (ids.length === 0) return;
  const user = await requireUser();
  await prisma.application.deleteMany({ where: { id: { in: ids }, userId: user.id } });
  revalidatePath("/applications");
}

/** Persist the user's column visibility/order preferences. */
export async function saveColumnPrefs(prefs: { order?: string[]; hidden?: string[] }) {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { applicationTablePrefs: prefs },
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
