import { prisma } from "@/lib/db";

export async function getNewJobsToday(limit = 10) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return prisma.job.findMany({
    where: {
      source: "ats",
      postedAt: { gte: start },
    },
    orderBy: { postedAt: "desc" },
    take: limit,
  });
}
