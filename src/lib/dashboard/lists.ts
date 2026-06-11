import { prisma } from "@/lib/db";

export type InterviewRow = {
  id: string;
  jobTitle: string;
  company: string;
  updatedAt: Date;
};

export type SavedRow = {
  id: string;
  jobTitle: string;
  company: string;
  url: string | null;
};

export async function getInterviewing(
  userId: string,
  limit = 8,
): Promise<InterviewRow[]> {
  const rows = await prisma.application.findMany({
    where: { userId, status: "interviewing" },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    jobTitle: r.job.title,
    company: r.job.company,
    updatedAt: r.updatedAt,
  }));
}

export async function getSavedNotApplied(
  userId: string,
  limit = 8,
): Promise<SavedRow[]> {
  const rows = await prisma.application.findMany({
    where: { userId, status: "saved" },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    jobTitle: r.job.title,
    company: r.job.company,
    url: r.job.url,
  }));
}
