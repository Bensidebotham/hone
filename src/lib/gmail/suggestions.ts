"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createManualApplication } from "@/lib/applications/actions";
import { recordApplicationEvent } from "@/lib/applications/events";
import { refreshAccessToken } from "@/lib/gmail/oauth";
import { getMessage } from "@/lib/gmail/client";
import { isDemoMessageId } from "@/lib/gmail/message-link";
import { cleanEmailBody } from "@/lib/gmail/body";
import { revalidatePath, refresh } from "next/cache";
import type { AppStatus } from "@prisma/client";

export interface PendingSuggestion {
  id: string;
  kind: string;
  suggestedStatus: AppStatus | null;
  company: string | null;
  title: string | null;
  createdAt: Date;
  /** Source email, so the suggestion can be checked before it's confirmed. */
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  subject: string | null;
  snippet: string | null;
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
    messageId: r.messageId,
    threadId: r.threadId,
    fromEmail: r.fromEmail,
    subject: r.subject,
    snippet: r.snippet,
    application: r.application
      ? { id: r.application.id, company: r.application.company, title: r.application.title }
      : null,
  }));
}

export type SuggestionEmail =
  | { ok: true; from: string; subject: string; body: string }
  | { ok: false; error: string };

/**
 * Read the source email behind a suggestion.
 *
 * Bodies are deliberately never persisted — sync stores only the sender,
 * subject and snippet — so this reads through to Gmail on demand, which also
 * means a deleted or unshared message simply fails closed.
 */
export async function getSuggestionEmail(insightId: string): Promise<SuggestionEmail> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return { ok: false, error: "That email is no longer available." };

  const from = insight.fromEmail;
  const subject = insight.subject ?? "(no subject)";

  if (isDemoMessageId(insight.messageId)) {
    return {
      ok: true, from, subject,
      body: "This is a sample suggestion from the demo inbox — there's no real email behind it.",
    };
  }

  const token = await refreshAccessToken(user.id);
  if (!token) return { ok: false, error: "Gmail isn't connected. Reconnect it in Settings to read this email." };

  try {
    const msg = await getMessage(token.accessToken, insight.messageId);
    const body = cleanEmailBody(msg.body);
    return {
      ok: true,
      from: msg.from || from,
      subject: msg.subject || subject,
      body: body || insight.snippet || "This email has no readable text body — open it in Gmail.",
    };
  } catch {
    return { ok: false, error: "Couldn't load this email from Gmail. Try opening it in Gmail instead." };
  }
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
  // The dashboard is force-dynamic, so there's no cache entry for revalidatePath
  // to invalidate — refresh() is what actually re-renders it for the client
  // router, and a confirm also moves the Updates feed and the stats tiles.
  refresh();
}

export async function dismissSuggestion(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;
  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "dismissed" } });
  refresh();
}
