import { prisma } from "@/lib/db";
import { recordApplicationEvent } from "@/lib/applications/events";
import { ROLE_PLACEHOLDER, type Decision } from "@/lib/gmail/decide";
import type { AppCandidate } from "@/lib/gmail/match";

export interface IncomingEmail {
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  subject: string | null;
  snippet: string | null;
  confidence: number;
  receivedAt: Date;
}

export interface ApplyResult {
  wrote: boolean;
  /** Set when this email created an application, so later mail in the run can match it. */
  created?: AppCandidate;
}

/**
 * Persist the outcome of one classified email. Idempotent on messageId: every
 * outcome — including "ignored" — writes exactly one EmailInsight, and that
 * row is what stops a message being classified again.
 */
export async function applyDecision(
  userId: string,
  email: IncomingEmail,
  decision: Decision
): Promise<ApplyResult> {
  const existing = await prisma.emailInsight.findUnique({
    where: { messageId: email.messageId },
    select: { id: true },
  });
  if (existing) return { wrote: false };

  const source = {
    userId, messageId: email.messageId, threadId: email.threadId,
    fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
    confidence: email.confidence,
  };

  if (decision.action === "ignore") {
    await prisma.emailInsight.create({
      data: { ...source, kind: "status_change", applicationId: decision.applicationId, outcome: "ignored" },
    });
    return { wrote: true };
  }

  if (decision.action === "create") {
    const app = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: {
          userId, company: decision.company, title: decision.title ?? ROLE_PLACEHOLDER,
          status: decision.status, appliedAt: email.receivedAt, source: "Email",
        },
      });
      await tx.applicationEvent.create({
        data: { applicationId: created.id, userId, type: "created", toStatus: decision.status, summary: "Added from email" },
      });
      await tx.emailInsight.create({
        data: {
          ...source, kind: "new_application", suggestedStatus: decision.status,
          applicationId: created.id, company: decision.company, title: decision.title,
          outcome: "auto_applied",
        },
      });
      return created;
    });
    return {
      wrote: true,
      created: { applicationId: app.id, company: app.company, title: app.title, status: app.status },
    };
  }

  if (decision.action === "auto_apply") {
    await prisma.application.update({
      where: { id: decision.applicationId },
      data: {
        status: decision.toStatus,
        appliedAt: decision.toStatus === "applied" ? email.receivedAt : undefined,
      },
    });
    await recordApplicationEvent({
      applicationId: decision.applicationId,
      userId,
      type: "email_detected",
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus,
    });
    await prisma.emailInsight.create({
      data: {
        ...source, kind: "status_change", suggestedStatus: decision.toStatus,
        applicationId: decision.applicationId, outcome: "auto_applied",
      },
    });
    return { wrote: true };
  }

  if (decision.action === "suggest_status") {
    await prisma.emailInsight.create({
      data: {
        ...source, kind: "status_change", suggestedStatus: decision.suggestedStatus,
        applicationId: decision.applicationId, outcome: "suggested",
      },
    });
    return { wrote: true };
  }

  // suggest_new
  await prisma.emailInsight.create({
    data: {
      ...source, kind: "new_application", suggestedStatus: decision.suggestedStatus,
      company: decision.company, title: decision.title, outcome: "suggested",
    },
  });
  return { wrote: true };
}
