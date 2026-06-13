"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { listSavedJobIds } from "@/lib/jobs/saved-queries";
import { JOBS_PAGE_SIZE, jobOrderBy, JOB_LIST_SELECT, type JobListRow } from "@/lib/jobs/constants";
export async function loadMoreJobs(
  params: Record<string, string | undefined>,
  cursorId: string
): Promise<{ jobs: JobListRow[]; nextCursor: string | null }> {
  const user = await requireUser();
  const where = params.saved === "true"
    ? { id: { in: [...await listSavedJobIds(user.id)] } }
    : buildJobWhere(params, user.id);
  const jobs = await prisma.job.findMany({
    where,
    orderBy: jobOrderBy(params.sort),
    cursor: { id: cursorId },
    skip: 1,
    take: JOBS_PAGE_SIZE,
    select: JOB_LIST_SELECT,
  });
  const nextCursor = jobs.length === JOBS_PAGE_SIZE ? jobs[jobs.length - 1].id : null;
  return { jobs, nextCursor };
}

export async function getJobDetail(id: string): Promise<JobListRow | null> {
  await requireUser();
  return prisma.job.findUnique({ where: { id }, select: JOB_LIST_SELECT });
}

/** Fetch just the heavy description for one job, on demand (kept out of the list
 *  query so browsing the feed doesn't ship descriptions that are never read). */
export async function getJobDescription(
  id: string,
): Promise<{ descriptionText: string; descriptionHtml: string | null } | null> {
  await requireUser();
  return prisma.job.findUnique({
    where: { id },
    select: { descriptionText: true, descriptionHtml: true },
  });
}
