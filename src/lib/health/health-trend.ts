import { prisma } from "@/lib/db";

export type HealthTrendPoint = { date: string; composite: number };

export async function getHealthTrend(userId: string): Promise<HealthTrendPoint[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await prisma.healthScore.findMany({
    where: { userId, createdAt: { gte: thirtyDaysAgo } },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    date: row.createdAt.toISOString().slice(0, 10),
    composite: row.composite,
  }));
}
