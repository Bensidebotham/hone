// src/lib/dashboard/digest-window.ts
import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Window start = earlier of (now - 24h) or the last visit. Always shows >= 24h. */
export function computeWindowStart(now: Date, lastVisitAt: Date | null): Date {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  if (!lastVisitAt) return dayAgo;
  return lastVisitAt.getTime() < dayAgo.getTime() ? lastVisitAt : dayAgo;
}

export async function getDigestWindow(
  userId: string
): Promise<{ windowStart: Date; previousVisitAt: Date | null }> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastDashboardVisitAt: true },
  });
  const previousVisitAt = row?.lastDashboardVisitAt ?? null;
  return { windowStart: computeWindowStart(new Date(), previousVisitAt), previousVisitAt };
}

export async function stampDashboardVisit(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastDashboardVisitAt: new Date() },
  });
}
