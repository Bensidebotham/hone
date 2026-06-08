import { prisma } from "@/lib/db";

export async function getRecentAppUpdates(userId: string, limit = 10) {
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
