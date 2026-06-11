import { getApplicationTrend } from "./application-trend";
import { getNewJobsForUser } from "./new-jobs";
import { getDigestWindow } from "./digest-window";
import { getRecentAppUpdates } from "@/lib/health/app-updates";
import { getPendingSuggestions } from "@/lib/gmail/suggestions";

export async function getDashboardSummary(userId: string) {
  const { windowStart, previousVisitAt } = await getDigestWindow(userId);

  const [applicationTrend, newJobs, appUpdates, pendingSuggestions] = await Promise.all([
    getApplicationTrend(userId),
    getNewJobsForUser(userId, windowStart),
    getRecentAppUpdates(userId, windowStart, previousVisitAt),
    getPendingSuggestions(userId),
  ]);

  return { previousVisitAt, applicationTrend, newJobs, appUpdates, pendingSuggestions };
}
