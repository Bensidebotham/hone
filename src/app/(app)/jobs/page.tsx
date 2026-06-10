import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { listSavedJobIds } from "@/lib/jobs/saved-queries";
import { JOBS_PAGE_SIZE, jobOrderBy, JOB_LIST_SELECT } from "@/lib/jobs/constants";
import { JobSearchBar } from "@/components/job-search-bar";
import { JobFilterChips } from "@/components/job-filter-chips";
import { JobsBrowser } from "@/components/jobs-browser";
import { toBrowserJob } from "@/components/job-browser-types";
import { JobScopeTabs } from "@/components/job-scope-tabs";

export const dynamic = "force-dynamic";

function JobsHeader({ savedCount, totalCount, isSavedView, filterKeys }: { savedCount: number; totalCount: number; isSavedView: boolean; filterKeys: string[] }) {
  return (
    <>
      <div className="mb-4">
        <p className="text-sm font-semibold text-primary">Jobs</p>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Find your next role
          <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-highlight align-middle" aria-hidden="true" />
        </h1>
        <p className="text-muted-foreground mt-1">New-grad &amp; entry-level US software roles.</p>
      </div>
      <div className="mb-3"><JobScopeTabs savedCount={savedCount} /></div>
      <p className="text-sm text-muted-foreground mb-3">
        {isSavedView
          ? `${totalCount.toLocaleString()} ${totalCount === 1 ? "saved role" : "saved roles"}`
          : `${totalCount.toLocaleString()} ${totalCount === 1 ? "role" : "roles"}${filterKeys.length > 0 ? " match your filters" : " available"}`}
      </p>
    </>
  );
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const user = await requireUser();
  const params: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? v[0] : v;

  const savedSet = await listSavedJobIds(user.id);
  const isSavedView = params.saved === "true";
  const filterKeys = Object.keys(rawParams).filter((k) => k !== "selected");

  // Remount the browser whenever the filters change (but NOT when only `selected`
  // changes), so its useState-seeded list/cursor resets to the new server query.
  // Soft navigation keeps the client component mounted, so without this the list
  // would stay frozen on the first filter set.
  const feedKey = Object.entries(rawParams)
    .filter(([k]) => k !== "selected")
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v ?? ""}`)
    .sort()
    .join("&");

  if (isSavedView) {
    const where = { id: { in: [...savedSet] } };
    const [rows, totalCount] = await Promise.all([
      prisma.job.findMany({ where, orderBy: jobOrderBy(params.sort), take: JOBS_PAGE_SIZE, select: JOB_LIST_SELECT }),
      prisma.job.count({ where }),
    ]);
    const initialJobs = rows.map(toBrowserJob);
    const initialCursor = rows.length === JOBS_PAGE_SIZE ? rows[rows.length - 1].id : null;
    return (
      <div className="max-w-6xl">
        <JobsHeader savedCount={savedSet.size} totalCount={totalCount} isSavedView filterKeys={filterKeys} />
        <JobsBrowser key={feedKey} savedView initialJobs={initialJobs} initialCursor={initialCursor} savedIds={[...savedSet]} hasFilters={filterKeys.length > 0} />
      </div>
    );
  }

  const where = buildJobWhere(params, user.id);
  const [rows, totalCount] = await Promise.all([
    prisma.job.findMany({ where, orderBy: jobOrderBy(params.sort), take: JOBS_PAGE_SIZE, select: JOB_LIST_SELECT }),
    prisma.job.count({ where }),
  ]);
  const initialJobs = rows.map(toBrowserJob);
  const initialCursor = rows.length === JOBS_PAGE_SIZE ? rows[rows.length - 1].id : null;

  return (
    <div className="max-w-6xl">
      <JobsHeader savedCount={savedSet.size} totalCount={totalCount} isSavedView={false} filterKeys={filterKeys} />
      <div className="flex flex-col gap-3 mb-4">
        <JobSearchBar />
        <JobFilterChips />
      </div>
      <JobsBrowser key={feedKey} initialJobs={initialJobs} initialCursor={initialCursor} savedIds={[...savedSet]} hasFilters={filterKeys.length > 0} />
    </div>
  );
}
