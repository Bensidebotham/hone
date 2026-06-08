"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { MatchButton } from "@/components/match-button";
import { SaveJobButton } from "@/components/save-job-button";
import { toggleSavedJob } from "@/lib/jobs/saved";

export type JobCardData = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  source: "ats" | "paste";
  salary: string | null;
};

export function JobCard({ job, saved }: { job: JobCardData; saved: boolean }) {
  const [isSaved, setIsSaved] = useState(saved);
  const [pending, start] = useTransition();

  function handleBookmark() {
    // Optimistic toggle
    setIsSaved((prev) => !prev);
    start(async () => {
      await toggleSavedJob(job.id);
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-base">{job.title}</CardTitle>
            <CardDescription>
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={job.source === "ats" ? "secondary" : "outline"}>
              {job.source === "ats" ? "ATS" : "Pasted"}
            </Badge>
            {/* Bookmark button — saves listing for later reading.
                Distinct from "Save to tracker" which adds to application pipeline. */}
            <button
              type="button"
              onClick={handleBookmark}
              disabled={pending}
              aria-label={isSaved ? "Remove bookmark" : "Bookmark job"}
              aria-pressed={isSaved}
              title={isSaved ? "Bookmarked (click to remove)" : "Bookmark this listing"}
              className="flex flex-col items-center gap-0 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {isSaved ? "★" : "☆"}
              </span>
              <span className="text-[0.6rem] leading-tight">Bookmark</span>
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground mb-1">
          {job.salary ?? "Salary not disclosed"}
        </p>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            View posting
          </a>
        )}
        <div className="flex items-center gap-2 mt-2">
          <MatchButton jobId={job.id} />
          <SaveJobButton jobId={job.id} />
        </div>
      </CardContent>
    </Card>
  );
}
