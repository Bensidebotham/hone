import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type NewJobRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
};

export function NewJobsRail({ jobs }: { jobs: NewJobRow[] }) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>New Jobs</CardTitle>
        {jobs.length > 0 && (
          <span className="text-xs text-muted-foreground">{jobs.length}</span>
        )}
      </CardHeader>

      <CardContent>
        {jobs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            You&apos;re caught up — no new matches in your search.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {jobs.map((job) => {
                const external = Boolean(job.url);
                const href = job.url ?? "/jobs";
                return (
                  <li
                    key={job.id}
                    className="-mx-2 flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={href}
                        {...(external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="block truncate font-medium underline-offset-4 hover:underline"
                      >
                        {job.title}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link
              href="/jobs"
              className="mt-2 block text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              View all jobs →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
