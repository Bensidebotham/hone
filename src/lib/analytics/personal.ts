import { prisma } from "@/lib/db";
import type { Funnel, Conversion, TimeInStage } from "./types";

const DAY_MS = 1000 * 60 * 60 * 24;

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

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Evt = {
  applicationId: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date;
};

function earliest(events: Evt[], pred: (e: Evt) => boolean): Date | null {
  const hits = events.filter(pred).map((e) => e.createdAt.getTime());
  return hits.length ? new Date(Math.min(...hits)) : null;
}

export async function getTimeInStage(userId: string): Promise<TimeInStage> {
  const events = (await prisma.applicationEvent.findMany({
    where: { userId, type: "status_change" },
    select: { applicationId: true, fromStatus: true, toStatus: true, createdAt: true },
  })) as Evt[];

  const byApp = new Map<string, Evt[]>();
  for (const e of events) {
    const list = byApp.get(e.applicationId) ?? [];
    list.push(e);
    byApp.set(e.applicationId, list);
  }

  const response: number[] = [];
  const decision: number[] = [];
  for (const evs of byApp.values()) {
    const appliedAt = earliest(evs, (e) => e.toStatus === "applied");
    const responseAt = earliest(evs, (e) => e.fromStatus === "applied");
    if (appliedAt && responseAt && responseAt >= appliedAt) {
      response.push((responseAt.getTime() - appliedAt.getTime()) / DAY_MS);
    }
    const interviewAt = earliest(evs, (e) => e.toStatus === "interviewing");
    const decisionAt = earliest(
      evs,
      (e) =>
        e.fromStatus === "interviewing" &&
        (e.toStatus === "offer" || e.toStatus === "rejected"),
    );
    if (interviewAt && decisionAt && decisionAt >= interviewAt) {
      decision.push((decisionAt.getTime() - interviewAt.getTime()) / DAY_MS);
    }
  }

  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    appliedToResponseN: response.length,
    appliedToResponseDays: response.length >= 3 ? round(median(response)) : null,
    interviewToDecisionN: decision.length,
    interviewToDecisionDays: decision.length >= 3 ? round(median(decision)) : null,
  };
}
