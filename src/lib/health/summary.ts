import { prisma } from "@/lib/db";
import { computeComposite } from "./composite";
import { getNewJobsToday } from "./new-jobs";
import { getRecentAppUpdates } from "./app-updates";
import { getHealthTrend } from "./health-trend";

const STATUSES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
type Status = (typeof STATUSES)[number];

async function latestScore(userId: string, type: "resume" | "linkedin" | "site") {
  const a = await prisma.analysis.findFirst({
    where: { userId, type, status: "complete" },
    orderBy: { createdAt: "desc" },
  });
  return a?.score ?? null;
}

export async function getDashboardSummary(userId: string) {
  const [resume, linkedin, site, newJobs, appUpdates, healthTrend] = await Promise.all([
    latestScore(userId, "resume"),
    latestScore(userId, "linkedin"),
    latestScore(userId, "site"),
    getNewJobsToday(),
    getRecentAppUpdates(userId),
    getHealthTrend(userId),
  ]);
  const components = { resume, linkedin, site };
  const composite = computeComposite(components);

  const grouped = await prisma.application.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });
  const funnel = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const g of grouped) {
    funnel[g.status as Status] = g._count?._all ?? 0;
  }

  return { composite, components, funnel, newJobs, appUpdates, healthTrend };
}
