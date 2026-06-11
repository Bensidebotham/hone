import { prisma } from "@/lib/db";
import { recordApplicationEvent } from "@/lib/applications/events";
import type { Decision } from "@/lib/gmail/decide";

export interface IncomingEmail {
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  subject: string | null;
  snippet: string | null;
  confidence: number;
}

/**
 * Persist the outcome of one classified email. Idempotent on messageId:
 * if an insight already exists for this message, do nothing.
 * Returns true if a row was written.
 */
export async function applyDecision(
  userId: string,
  email: IncomingEmail,
  decision: Decision
): Promise<boolean> {
  if (decision.action === "skip") return false;

  const existing = await prisma.emailInsight.findUnique({
    where: { messageId: email.messageId },
    select: { id: true },
  });
  if (existing) return false;

  if (decision.action === "auto_apply") {
    await prisma.application.update({
      where: { id: decision.applicationId },
      data: {
        status: decision.toStatus,
        appliedAt: decision.toStatus === "applied" ? new Date() : undefined,
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
        userId, messageId: email.messageId, threadId: email.threadId,
        fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
        kind: "status_change", suggestedStatus: decision.toStatus,
        applicationId: decision.applicationId, confidence: email.confidence,
        outcome: "auto_applied",
      },
    });
    return true;
  }

  if (decision.action === "suggest_status") {
    await prisma.emailInsight.create({
      data: {
        userId, messageId: email.messageId, threadId: email.threadId,
        fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
        kind: "status_change", suggestedStatus: decision.suggestedStatus,
        applicationId: decision.applicationId, confidence: email.confidence,
        outcome: "suggested",
      },
    });
    return true;
  }

  // suggest_new
  await prisma.emailInsight.create({
    data: {
      userId, messageId: email.messageId, threadId: email.threadId,
      fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
      kind: "new_application", suggestedStatus: decision.suggestedStatus,
      company: decision.company, title: decision.title, confidence: email.confidence,
      outcome: "suggested",
    },
  });
  return true;
}
