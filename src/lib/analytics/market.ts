import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  MarketAnalytics,
  WeeklyPoint,
  SalaryBucket,
  TechCount,
} from "./types";

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type RawWeek = { week: Date; count: bigint };

/** Build `weeks` contiguous Monday buckets (oldest first) and map raw counts on. */
export function fillWeeks(rows: RawWeek[], weeks: number): WeeklyPoint[] {
  const thisMonday = mondayOf(new Date());
  const buckets: WeeklyPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - (weeks - 1 - i) * 7);
    buckets.push({ weekStart: ymd(start), count: 0 });
  }
  for (const row of rows) {
    const key = ymd(mondayOf(new Date(row.week)));
    const b = buckets.find((x) => x.weekStart === key);
    if (b) b.count += Number(row.count);
  }
  return buckets;
}

export async function getJobVolume(weeks = 12): Promise<WeeklyPoint[]> {
  const since = mondayOf(new Date());
  since.setDate(since.getDate() - (weeks - 1) * 7);
  const rows = await prisma.$queryRaw<RawWeek[]>(Prisma.sql`
    SELECT date_trunc('week', COALESCE("postedAt", "createdAt")) AS week,
           count(*) AS count
    FROM "Job"
    WHERE "userId" IS NULL
      AND COALESCE("postedAt", "createdAt") >= ${since}
    GROUP BY 1
  `);
  return fillWeeks(rows, weeks);
}

export async function getSalary(): Promise<MarketAnalytics["salary"]> {
  const rows = await prisma.$queryRaw<{ label: string; count: bigint }[]>(Prisma.sql`
    SELECT CASE
      WHEN mid < 50000  THEN '<50k'
      WHEN mid < 80000  THEN '50-80k'
      WHEN mid < 110000 THEN '80-110k'
      WHEN mid < 140000 THEN '110-140k'
      WHEN mid < 180000 THEN '140-180k'
      ELSE '180k+'
    END AS label, count(*) AS count
    FROM (
      SELECT ("salaryMin" + COALESCE("salaryMax", "salaryMin")) / 2.0 AS mid
      FROM "Job"
      WHERE "userId" IS NULL AND "active" = true AND "salaryMin" IS NOT NULL
    ) m
    GROUP BY 1
  `);
  const ORDER = ["<50k", "50-80k", "80-110k", "110-140k", "140-180k", "180k+"];
  const map = new Map(rows.map((r) => [r.label, Number(r.count)]));
  const buckets: SalaryBucket[] = ORDER.map((label) => ({
    label,
    count: map.get(label) ?? 0,
  }));

  const [withSalary, total] = await Promise.all([
    prisma.job.count({
      where: { userId: null, active: true, salaryMin: { not: null } },
    }),
    prisma.job.count({ where: { userId: null, active: true } }),
  ]);
  const coveragePct = total === 0 ? null : Math.round((withSalary / total) * 100);
  return { buckets, coveragePct };
}

export async function getTopTech(limit = 12): Promise<TechCount[]> {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>(Prisma.sql`
    SELECT unnest("techTags") AS tag, count(*) AS count
    FROM "Job"
    WHERE "userId" IS NULL AND "active" = true
    GROUP BY 1
    ORDER BY count DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

export async function getRemoteSplit(): Promise<MarketAnalytics["remote"]> {
  const rows = await prisma.job.groupBy({
    by: ["isRemote"],
    where: { userId: null, active: true },
    _count: { _all: true },
  });
  const get = (v: boolean) =>
    rows.find((r) => r.isRemote === v)?._count._all ?? 0;
  return { remote: get(true), onsite: get(false) };
}

export async function getMarketAnalytics(): Promise<MarketAnalytics> {
  const [jobVolume, salary, topTech, remote] = await Promise.all([
    getJobVolume(),
    getSalary(),
    getTopTech(),
    getRemoteSplit(),
  ]);
  return { jobVolume, salary, topTech, remote };
}
