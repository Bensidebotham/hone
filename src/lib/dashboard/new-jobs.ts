// src/lib/dashboard/new-jobs.ts
import { prisma } from "@/lib/db";

export async function getNewJobs24h(limit = 25) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.job.findMany({
    where: { source: "ats", postedAt: { gte: since } },
    orderBy: { postedAt: "desc" },
    take: limit,
  });
}
