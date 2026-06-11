import { prisma } from "@/lib/db";
import { getActivityStats } from "./stats";
import { getApplicationTrend } from "./application-trend";
import { getNewJobs24h } from "./new-jobs";
import { getInterviewing, getSavedNotApplied } from "./lists";
import { getRecentAppUpdates } from "@/lib/health/app-updates";

const STATUSES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export async function getDashboardSummary(userId: string) {
  const [stats, applicationTrend, newJobs, appUpdates, interviewing, savedNotApplied, grouped] =
    await Promise.all([
      getActivityStats(userId),
      getApplicationTrend(userId),
      getNewJobs24h(),
      getRecentAppUpdates(userId),
      getInterviewing(userId),
      getSavedNotApplied(userId),
      prisma.application.groupBy({
        by: ["status"],
        where: { userId },
        _count: { _all: true },
      }),
    ]);

  const funnel = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const g of grouped) {
    funnel[g.status as Status] = g._count?._all ?? 0;
  }

  return { stats, applicationTrend, funnel, newJobs, appUpdates, interviewing, savedNotApplied };
}
