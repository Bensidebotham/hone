import type { AppStatus } from "@prisma/client";
import type { Classification } from "@/lib/gmail/classify";
import type { MatchResult } from "@/lib/gmail/match";

export const AUTO_APPLY_THRESHOLD = 0.8;

export type Decision =
  | { action: "auto_apply"; applicationId: string; fromStatus: AppStatus; toStatus: AppStatus }
  | { action: "suggest_status"; applicationId: string; suggestedStatus: AppStatus }
  | { action: "suggest_new"; suggestedStatus: AppStatus; company: string | null; title: string | null }
  | { action: "skip"; reason: string };

export function decideEmailAction(c: Classification, m: MatchResult): Decision {
  if (c.status === "none") return { action: "skip", reason: "status none" };

  // status is now one of the AppStatus values (applied|interviewing|offer|rejected).
  const toStatus = c.status as AppStatus;

  if (m.applicationId) {
    if (m.currentStatus === toStatus) return { action: "skip", reason: "already in status" };
    if (c.confidence >= AUTO_APPLY_THRESHOLD) {
      return { action: "auto_apply", applicationId: m.applicationId, fromStatus: m.currentStatus!, toStatus };
    }
    return { action: "suggest_status", applicationId: m.applicationId, suggestedStatus: toStatus };
  }

  return { action: "suggest_new", suggestedStatus: toStatus, company: c.company, title: c.title };
}
