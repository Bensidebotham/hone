"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
}

const COLLAPSED = 4;

export function NewJobsCard({ jobs }: { jobs: JobRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? jobs : jobs.slice(0, COLLAPSED);
  const remaining = jobs.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>New Jobs · last 24h</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No new jobs in the last 24 hours.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((job) => (
                <li
                  key={job.id}
                  className="flex items-start justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    {job.url ? (
                      <Link
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline underline-offset-4 truncate block"
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
            {remaining > 0 && (
              <ShowMoreButton
                expanded={expanded}
                remaining={remaining}
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
            <Link
              href="/jobs"
              className="mt-2 block text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              View all jobs →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
