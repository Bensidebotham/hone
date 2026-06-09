"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { JOBS_PAGE_SIZE, type JobListRow } from "@/lib/jobs/constants";

export async function loadMoreJobs(
  params: Record<string, string | undefined>,
  cursorId: string
): Promise<{ jobs: JobListRow[]; nextCursor: string | null }> {
  const user = await requireUser();
  const where = buildJobWhere(params, user.id);
  const jobs = await prisma.job.findMany({
    where,
    orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    cursor: { id: cursorId },
    skip: 1,
    take: JOBS_PAGE_SIZE,
    select: {
      id: true, title: true, company: true, location: true, url: true,
      salary: true, postedAt: true, roleCategory: true, level: true,
      techTags: true, descriptionText: true, descriptionHtml: true,
    },
  });
  const nextCursor = jobs.length === JOBS_PAGE_SIZE ? jobs[jobs.length - 1].id : null;
  return { jobs, nextCursor };
}
