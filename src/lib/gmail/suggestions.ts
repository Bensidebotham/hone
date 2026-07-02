"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createManualApplication } from "@/lib/applications/actions";
import { recordApplicationEvent } from "@/lib/applications/events";
import { revalidatePath } from "next/cache";
import type { AppStatus } from "@prisma/client";

export interface PendingSuggestion {
  id: string;
  kind: string;
  suggestedStatus: AppStatus | null;
  company: string | null;
  title: string | null;
  createdAt: Date;
  application: { id: string; company: string; title: string } | null;
}

/** Suggested (un-actioned) insights for the dashboard card. */
export async function getPendingSuggestions(userId: string, limit = 8): Promise<PendingSuggestion[]> {
  const rows = await prisma.emailInsight.findMany({
    where: { userId, outcome: "suggested" },
    include: { application: { select: { id: true, company: true, title: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    suggestedStatus: r.suggestedStatus,
    company: r.company ?? r.application?.company ?? null,
    title: r.title ?? r.application?.title ?? null,
    createdAt: r.createdAt,
    application: r.application
      ? { id: r.application.id, company: r.application.company, title: r.application.title }
      : null,
  }));
}

export async function confirmSuggestion(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;

  if (insight.kind === "status_change" && insight.applicationId && insight.suggestedStatus) {
    // Apply the status and log it as email-detected, preserving the "from email"
    // provenance in the Updates feed (same event type as the auto-applied path).
    const app = await prisma.application.findFirst({
      where: { id: insight.applicationId, userId: user.id },
      select: { status: true },
    });
    if (!app) return;
    await prisma.application.update({
      where: { id: insight.applicationId },
      data: {
        status: insight.suggestedStatus,
        appliedAt: insight.suggestedStatus === "applied" ? new Date() : undefined,
      },
    });
    if (app.status !== insight.suggestedStatus) {
      await recordApplicationEvent({
        applicationId: insight.applicationId,
        userId: user.id,
        type: "email_detected",
        fromStatus: app.status,
        toStatus: insight.suggestedStatus,
      });
    }
    revalidatePath("/applications");
  } else if (insight.kind === "new_application" && insight.company && insight.title) {
    await createManualApplication({
      company: insight.company,
      title: insight.title,
      status: insight.suggestedStatus ?? "applied",
    });
  } else {
    return;
  }

  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "accepted" } });
  revalidatePath("/dashboard");
}

export async function dismissSuggestion(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;
  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "dismissed" } });
  revalidatePath("/dashboard");
}
