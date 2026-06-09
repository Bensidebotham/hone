"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { listSavedJobIds } from "@/lib/jobs/saved-queries";
import { JOBS_PAGE_SIZE, jobOrderBy, JOB_LIST_SELECT, type JobListRow } from "@/lib/jobs/constants";
import { getCompanyFeedPage, type CompanyGroup } from "@/lib/jobs/grouped";

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

export async function loadCompanyRoles(
  company: string,
  params: Record<string, string | undefined>
): Promise<JobListRow[]> {
  const user = await requireUser();
  const where = buildJobWhere(params, user.id);
  return prisma.job.findMany({
    where: { AND: [where, { company }] },
    orderBy: jobOrderBy(params.sort),
    skip: 2,
    take: 50,
    select: JOB_LIST_SELECT,
  });
}

export async function loadMoreCompanies(
  params: Record<string, string | undefined>,
  page: number
): Promise<{ groups: CompanyGroup[]; hasMore: boolean }> {
  const user = await requireUser();
  return getCompanyFeedPage(params, user.id, page);
}

export async function getJobDetail(id: string): Promise<JobListRow | null> {
  await requireUser();
  return prisma.job.findUnique({ where: { id }, select: JOB_LIST_SELECT });
}
