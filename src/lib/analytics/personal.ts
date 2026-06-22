import { prisma } from "@/lib/db";
import type { Funnel, Conversion } from "./types";

export async function getFunnel(userId: string): Promise<Funnel> {
  const rows = await prisma.application.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });
  const by = (s: string) =>
    rows.find((r) => r.status === s)?._count._all ?? 0;
  const applied =
    by("applied") + by("interviewing") + by("offer") + by("rejected");
  const interviewing = by("interviewing") + by("offer");
  return { applied, interviewing, offer: by("offer"), rejected: by("rejected") };
}

function pct(num: number, denom: number): number | null {
  if (denom === 0) return null;
  return Math.round((num / denom) * 100);
}

export function getConversion(funnel: Funnel): Conversion {
  return {
    appliedToInterview: pct(funnel.interviewing, funnel.applied),
    interviewToOffer: pct(funnel.offer, funnel.interviewing),
  };
}
