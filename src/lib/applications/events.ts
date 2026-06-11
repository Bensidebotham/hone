// src/lib/applications/events.ts
import { prisma } from "@/lib/db";
import type { AppEventType, AppStatus } from "@prisma/client";

const STATUS_LABEL: Record<AppStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

export interface RecordEventInput {
  applicationId: string;
  userId: string;
  type: AppEventType;
  fromStatus?: AppStatus;
  toStatus?: AppStatus;
  summary?: string;
}

function defaultSummary(input: RecordEventInput): string | undefined {
  if (input.summary) return input.summary;
  if (input.type === "created") return "Added to tracker";
  if (input.type === "status_change" && input.toStatus) {
    return `Moved to ${STATUS_LABEL[input.toStatus]}`;
  }
  if (input.type === "email_detected" && input.toStatus) {
    return `${STATUS_LABEL[input.toStatus]} (detected from email)`;
  }
  return undefined;
}

export async function recordApplicationEvent(input: RecordEventInput): Promise<void> {
  await prisma.applicationEvent.create({
    data: {
      applicationId: input.applicationId,
      userId: input.userId,
      type: input.type,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      summary: defaultSummary(input),
    },
  });
}
