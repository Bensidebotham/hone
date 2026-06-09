import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { listSavedJobIds } from "@/lib/jobs/saved-queries";
import { JOBS_PAGE_SIZE } from "@/lib/jobs/constants";
import { JobSearchBar } from "@/components/job-search-bar";
import { JobFilterChips } from "@/components/job-filter-chips";
import { JobsBrowser, type BrowserJob } from "@/components/jobs-browser";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const where = buildJobWhere(params, user.id);

  const [rows, savedSet] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      take: JOBS_PAGE_SIZE,
      select: {
        id: true, title: true, company: true, location: true, url: true,
        salary: true, postedAt: true, techTags: true, descriptionText: true,
      },
    }),
    listSavedJobIds(user.id),
  ]);

  const initialJobs: BrowserJob[] = rows.map((r) => ({
    id: r.id, title: r.title, company: r.company, location: r.location,
    salary: r.salary, url: r.url,
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    techTags: r.techTags, descriptionText: r.descriptionText,
  }));

  const initialCursor =
    rows.length === JOBS_PAGE_SIZE ? rows[rows.length - 1].id : null;

  // Selection-only params don't count as "filters" for the empty state.
  const filterKeys = Object.keys(params).filter((k) => k !== "selected");

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">Jobs</h1>
      <p className="text-muted-foreground mb-4">
        Browse US software roles synced from company job boards.
      </p>

      <div className="flex flex-col gap-3 mb-4">
        <JobSearchBar />
        <JobFilterChips />
      </div>

      <JobsBrowser
        initialJobs={initialJobs}
        initialCursor={initialCursor}
        savedIds={[...savedSet]}
        hasFilters={filterKeys.length > 0}
      />
    </div>
  );
}
