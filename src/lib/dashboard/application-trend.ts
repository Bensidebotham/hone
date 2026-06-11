import { prisma } from "@/lib/db";

export const WEEKS = 10;

export type ApplicationTrendPoint = { weekStart: string; count: number };

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getApplicationTrend(
  userId: string,
): Promise<ApplicationTrendPoint[]> {
  const thisMonday = mondayOf(new Date());
  // Build WEEKS consecutive Monday buckets: oldest is WEEKS weeks before thisMonday
  const buckets: { start: Date; key: string; count: number }[] = [];
  for (let i = 0; i < WEEKS; i++) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - (WEEKS - 1 - i) * 7);
    buckets.push({ start, key: ymd(start), count: 0 });
  }
  // gte is set 1 week before the oldest bucket — slightly wider than strictly needed.
  // The bucket-key lookup below is the real filter; out-of-range rows are silently dropped.
  const since = new Date(buckets[0].start);
  since.setDate(since.getDate() - 7);

  const rows = await prisma.application.findMany({
    where: { userId, appliedAt: { not: null, gte: since } },
    select: { appliedAt: true },
  });

  for (const row of rows) {
    if (!row.appliedAt) continue;
    const wkKey = ymd(mondayOf(row.appliedAt));
    const bucket = buckets.find((b) => b.key === wkKey);
    if (bucket) bucket.count++;
  }

  return buckets.map((b) => ({ weekStart: b.key, count: b.count }));
}
