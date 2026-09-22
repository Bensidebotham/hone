import type { AppStatus } from "@prisma/client";
import type { Classification } from "@/lib/gmail/classify";
import type { MatchResult } from "@/lib/gmail/match";

export const AUTO_APPLY_THRESHOLD = 0.8;

/** Title for an application whose email never named the role. */
export const ROLE_PLACEHOLDER = "Role not specified";

export type Decision =
  | { action: "auto_apply"; applicationId: string; fromStatus: AppStatus; toStatus: AppStatus }
  | { action: "suggest_status"; applicationId: string; suggestedStatus: AppStatus }
  | { action: "create"; status: AppStatus; company: string; title: string | null }
  | { action: "suggest_new"; suggestedStatus: AppStatus; company: string | null; title: string | null }
  | { action: "ignore"; reason: string; applicationId: string | null };

const RANK: Record<Exclude<AppStatus, "rejected">, number> = {
  saved: 0, applied: 1, interviewing: 2, offer: 3,
};

/**
 * Whether email may move an application from one status to another. Mail is
 * processed out of order during a backfill, so an old "we received your
 * application" must never drag an interview back to applied.
 */
export function canAutoMove(from: AppStatus, to: AppStatus): boolean {
  if (from === "rejected" || from === "offer") return false;
  if (to === "rejected") return true;
  return RANK[to] > RANK[from];
}

export function decideEmailAction(c: Classification, m: MatchResult): Decision {
  if (c.status === "none") {
    return { action: "ignore", reason: "not an application email", applicationId: m.applicationId };
  }

  // status is now one of the AppStatus values (applied|interviewing|offer|rejected).
  const toStatus = c.status as AppStatus;

  if (m.applicationId) {
    // A confirmation naming a different role is a second application at the
    // same company, not an update. Suggest rather than create: "SWE" vs
    // "Software Engineer" would otherwise duplicate.
    if (m.titleMismatch && toStatus === "applied") {
      return { action: "suggest_new", suggestedStatus: toStatus, company: c.company?.trim() || null, title: c.title };
    }
    const from = m.currentStatus!;
    if (from === toStatus) return { action: "ignore", reason: "already in status", applicationId: m.applicationId };
    if (!canAutoMove(from, toStatus)) {
      return { action: "ignore", reason: "would regress status", applicationId: m.applicationId };
    }
    if (c.confidence >= AUTO_APPLY_THRESHOLD) {
      return { action: "auto_apply", applicationId: m.applicationId, fromStatus: from, toStatus };
    }
    return { action: "suggest_status", applicationId: m.applicationId, suggestedStatus: toStatus };
  }

  const company = c.company?.trim() || null;
  if (company && c.confidence >= AUTO_APPLY_THRESHOLD) {
    return { action: "create", status: toStatus, company, title: c.title?.trim() || null };
  }
  return { action: "suggest_new", suggestedStatus: toStatus, company, title: c.title };
}
