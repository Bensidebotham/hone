// src/lib/dashboard/new-jobs.ts
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";

/**
 * New jobs for the digest: the same curated pool the Jobs page shows
 * (via buildJobWhere with default params), posted since `windowStart`,
 * excluding any job already in the user's pipeline.
 */
export async function getNewJobsForUser(userId: string, windowStart: Date, limit = 5) {
  const curated = buildJobWhere({}, userId);
  return prisma.job.findMany({
    where: {
      AND: [
        curated,
        { postedAt: { gte: windowStart } },
        { applications: { none: { userId } } },
      ],
    },
    orderBy: { postedAt: "desc" },
    take: limit,
    // The rail only renders these fields — never select the heavy description blobs.
    select: { id: true, title: true, company: true, location: true, url: true },
  });
}
