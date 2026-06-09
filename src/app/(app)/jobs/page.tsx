import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { listSavedJobIds } from "@/lib/jobs/saved-queries";
import { parseSalary } from "@/lib/jobs/salary";
import { PasteJobForm } from "@/components/paste-job-form";
import { JobFilterBar } from "@/components/job-filter-bar";
import { JobCard } from "@/components/job-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const where = buildJobWhere(params, user.id);
  const [jobs, savedIds] = await Promise.all([
    prisma.job.findMany({ where, orderBy: { postedAt: "desc" }, take: 100 }),
    listSavedJobIds(user.id),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Jobs</h1>
      <p className="text-muted-foreground mb-6">
        Browse ATS-synced listings or paste a job description to track it
        manually.
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Paste a Job</CardTitle>
          <CardDescription>
            Copy a job posting you found and save it to your feed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasteJobForm />
        </CardContent>
      </Card>

      <div className="mb-6">
        <JobFilterBar />
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {Object.keys(params).length > 0
            ? "No jobs match your filters."
            : "No jobs yet — paste one above or wait for the ATS sync to run."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={{
                id: job.id,
                title: job.title,
                company: job.company,
                location: job.location,
                url: job.url,
                source: job.source,
                salary: job.salary ?? parseSalary(job.descriptionText),
              }}
              saved={savedIds.has(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
