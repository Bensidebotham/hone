import { prisma } from "@/lib/db";

export type ActivityStats = {
  appliedThisWeek: number;
  appliedTotal: number;
  interviewing: number;
  responseRate: number | null;
};

/** Start of the current week (Monday 00:00 local time). */
function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

export async function getActivityStats(userId: string): Promise<ActivityStats> {
  const weekStart = startOfWeek();
  const [appliedThisWeek, appliedTotal, interviewing, advanced] = await Promise.all([
    prisma.application.count({ where: { userId, appliedAt: { gte: weekStart } } }),
    prisma.application.count({ where: { userId, appliedAt: { not: null } } }),
    prisma.application.count({ where: { userId, status: "interviewing" } }),
    prisma.application.count({ where: { userId, status: { in: ["interviewing", "offer"] } } }),
  ]);

  const responseRate =
    appliedTotal === 0 ? null : Math.round((advanced / appliedTotal) * 100);

  return { appliedThisWeek, appliedTotal, interviewing, responseRate };
}
