import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
}

interface NewJobsCardProps {
  jobs: JobRow[];
}

export function NewJobsCard({ jobs }: NewJobsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>New Jobs Today</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new jobs today.</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((job) => (
              <li key={job.id} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  {job.url ? (
                    <Link
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline truncate block"
                    >
                      {job.title}
                    </Link>
                  ) : (
                    <span className="font-medium truncate block">{job.title}</span>
                  )}
                  <span className="text-muted-foreground truncate block">
                    {job.company}
                    {job.location ? ` · ${job.location}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
