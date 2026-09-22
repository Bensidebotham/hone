"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { createManualApplication } from "@/lib/applications/actions";
import { recordApplicationEvent } from "@/lib/applications/events";
import { refreshAccessToken } from "@/lib/gmail/oauth";
import { getMessage } from "@/lib/gmail/client";
import { isDemoMessageId } from "@/lib/gmail/message-link";
import { cleanEmailBody } from "@/lib/gmail/body";
import { matchApplication } from "@/lib/gmail/match";
import { ROLE_PLACEHOLDER } from "@/lib/gmail/decide";
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
  if (!token.ok) return { ok: false, error: "Gmail isn't connected. Reconnect it in Settings to read this email." };

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

  let applicationId: string;

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
    applicationId = insight.applicationId;
  } else if (insight.kind === "new_application" && insight.company) {
    // The app may have been tracked since this was suggested (by hand, or by a
    // later auto-add) — link to it rather than creating a duplicate.
    const apps = await prisma.application.findMany({
      where: { userId: user.id },
      select: { id: true, company: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    const match = matchApplication(
      { fromEmail: insight.fromEmail, company: insight.company, title: insight.title },
      apps.map((a) => ({ applicationId: a.id, company: a.company, title: a.title, status: a.status }))
    );
    applicationId = match.applicationId ?? await createManualApplication({
      company: insight.company,
      title: insight.title ?? ROLE_PLACEHOLDER,
      status: insight.suggestedStatus ?? "applied",
    });
  } else {
    return;
  }

  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "accepted", applicationId } });
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

export interface RecentAutoAdd {
  id: string;
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  subject: string | null;
  createdAt: Date;
  application: { id: string; company: string; title: string; status: AppStatus };
}

const AUTO_ADD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Applications sync added on its own in the last week, so they can be checked (or undone). */
export async function getRecentAutoAdds(userId: string, now = new Date()): Promise<RecentAutoAdd[]> {
  const rows = await prisma.emailInsight.findMany({
    where: {
      userId, kind: "new_application", outcome: "auto_applied",
      applicationId: { not: null }, createdAt: { gte: new Date(now.getTime() - AUTO_ADD_WINDOW_MS) },
    },
    include: { application: { select: { id: true, company: true, title: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return rows
    .filter((r) => r.application)
    .map((r) => ({
      id: r.id, messageId: r.messageId, threadId: r.threadId, fromEmail: r.fromEmail,
      subject: r.subject, createdAt: r.createdAt, application: r.application!,
    }));
}

/**
 * Take back an application sync added on its own. The insight stays (dismissed)
 * so the same email can never re-create it.
 */
export async function undoAutoAdd(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;
  if (insight.kind !== "new_application" || insight.outcome !== "auto_applied") return;

  if (insight.applicationId) {
    await prisma.application.deleteMany({ where: { id: insight.applicationId, userId: user.id } });
  }
  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "dismissed", applicationId: null } });
  revalidatePath("/applications");
  refresh();
}
