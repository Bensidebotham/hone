import { getApplicationTrend } from "./application-trend";
import { getDigestWindow } from "./digest-window";
import { getRecentAppUpdates } from "@/lib/health/app-updates";
import { getPendingSuggestions } from "@/lib/gmail/suggestions";
import { getActivityStats } from "./stats";
import { getInterviewing } from "./lists";

export async function getDashboardSummary(userId: string) {
  const { windowStart, previousVisitAt } = await getDigestWindow(userId);

  const [applicationTrend, appUpdates, pendingSuggestions, activityStats, interviewing] =
    await Promise.all([
      getApplicationTrend(userId),
      getRecentAppUpdates(userId, windowStart, previousVisitAt),
      getPendingSuggestions(userId),
      getActivityStats(userId),
      getInterviewing(userId),
    ]);

  return { previousVisitAt, applicationTrend, appUpdates, pendingSuggestions, activityStats, interviewing };
}
