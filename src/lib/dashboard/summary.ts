import { getApplicationTrend } from "./application-trend";
import { getNewJobsForUser } from "./new-jobs";
import { getDigestWindow } from "./digest-window";
import { getRecentAppUpdates } from "@/lib/health/app-updates";

export async function getDashboardSummary(userId: string) {
  const { windowStart, previousVisitAt } = await getDigestWindow(userId);

  const [applicationTrend, newJobs, appUpdates] = await Promise.all([
    getApplicationTrend(userId),
    getNewJobsForUser(userId, windowStart),
    getRecentAppUpdates(userId, windowStart, previousVisitAt),
  ]);

  return { previousVisitAt, applicationTrend, newJobs, appUpdates };
}
