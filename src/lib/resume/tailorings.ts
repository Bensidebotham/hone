import { prisma } from "@/lib/db";
import type { TailoringResult } from "./tailor-prompt";

export interface TailoringListItem {
  id: string;
  company: string | null;
  jobTitle: string | null;
  fitScore: number;
  createdAt: Date;
  applicationId: string | null;
}

export async function getTailorings(userId: string): Promise<TailoringListItem[]> {
  return prisma.tailoring.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, company: true, jobTitle: true, fitScore: true, createdAt: true, applicationId: true },
  });
}

export async function getTailoredApplicationIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.tailoring.findMany({
    where: { userId, applicationId: { not: null } },
    select: { applicationId: true },
    distinct: ["applicationId"],
  });
  return new Set(rows.map((r) => r.applicationId).filter((x): x is string => x !== null));
}

export async function getTailoring(
  userId: string,
  id: string
): Promise<({ id: string; jobDescription: string; company: string | null; jobTitle: string | null } & TailoringResult) | null> {
  const row = await prisma.tailoring.findFirst({ where: { id, userId } });
  if (!row) return null;
  return {
    id: row.id,
    jobDescription: row.jobDescription,
    company: row.company,
    jobTitle: row.jobTitle,
    ...(row.result as TailoringResult),
  };
}
