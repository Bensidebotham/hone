import type { Prisma } from "@prisma/client";

export const JOBS_PAGE_SIZE = 25;

export type JobSort = "new" | "salary";

/** Single source of truth for feed ordering — used by both the page query and loadMoreJobs
 *  so cursor pagination stays consistent. Always ends with id desc as a stable tiebreaker. */
export function jobOrderBy(sort: string | undefined): Prisma.JobOrderByWithRelationInput[] {
  if (sort === "salary") {
    return [{ salaryMax: { sort: "desc", nulls: "last" } }, { id: "desc" }];
  }
  return [{ postedAt: "desc" }, { id: "desc" }];
}

export interface JobListRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  salary: string | null;
  postedAt: Date | null;
  roleCategory: string | null;
  level: string | null;
  techTags: string[];
  descriptionText: string;
  descriptionHtml: string | null;
}
