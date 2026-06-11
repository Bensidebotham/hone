import { prisma } from "@/lib/db";
import type { AppStatus } from "@prisma/client";

export type AppUpdate = {
  id: string;
  applicationId: string;
  status: AppStatus | null;
  summary: string | null;
  createdAt: Date;
  isNew: boolean;
  job: { title: string; company: string };
};

/**
 * Recent application updates for the digest, read from the ApplicationEvent log.
 * `windowStart` bounds how far back to look; `previousVisitAt` marks which
 * events are "new" (occurred after the user's prior dashboard visit).
 */
export async function getRecentAppUpdates(
  userId: string,
  windowStart: Date,
  previousVisitAt: Date | null = null,
  limit = 10
): Promise<AppUpdate[]> {
  const rows = await prisma.applicationEvent.findMany({
    where: { userId, createdAt: { gte: windowStart } },
    include: { application: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    applicationId: row.application.id,
    status: row.toStatus,
    summary: row.summary,
    createdAt: row.createdAt,
    isNew: previousVisitAt ? row.createdAt > previousVisitAt : true,
    job: { title: row.application.job.title, company: row.application.job.company },
  }));
}
