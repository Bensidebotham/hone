"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { updateStatus, createManualApplication } from "@/lib/applications/actions";
import { revalidatePath } from "next/cache";
import type { AppStatus } from "@prisma/client";

export interface PendingSuggestion {
  id: string;
  kind: string;
  suggestedStatus: AppStatus | null;
  company: string | null;
  title: string | null;
  createdAt: Date;
  application: { id: string; job: { title: string; company: string } } | null;
}

/** Suggested (un-actioned) insights for the dashboard card. */
export async function getPendingSuggestions(userId: string, limit = 8): Promise<PendingSuggestion[]> {
  const rows = await prisma.emailInsight.findMany({
    where: { userId, outcome: "suggested" },
    include: { application: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    suggestedStatus: r.suggestedStatus,
    company: r.company ?? r.application?.job.company ?? null,
    title: r.title ?? r.application?.job.title ?? null,
    createdAt: r.createdAt,
    application: r.application
      ? { id: r.application.id, job: { title: r.application.job.title, company: r.application.job.company } }
      : null,
  }));
}

export async function confirmSuggestion(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;

  if (insight.kind === "status_change" && insight.applicationId && insight.suggestedStatus) {
    // updateStatus records the status_change event and revalidates.
    await updateStatus(insight.applicationId, insight.suggestedStatus);
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
