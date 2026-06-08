import { prisma } from "@/lib/db";
import type { AppStatus } from "@prisma/client";

export type AppUpdate = {
  id: string;
  status: AppStatus;
  updatedAt: Date;
  job: { title: string; company: string };
};

export async function getRecentAppUpdates(userId: string, limit = 10): Promise<AppUpdate[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await prisma.application.findMany({
    where: { userId, updatedAt: { gte: since } },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    updatedAt: row.updatedAt,
    job: { title: row.job.title, company: row.job.company },
  }));
}
