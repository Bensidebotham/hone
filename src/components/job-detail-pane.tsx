// src/components/job-detail-pane.tsx
"use client";

import { CompanyLogo } from "@/components/company-logo";
import { MatchButton } from "@/components/match-button";
import { SaveJobButton } from "@/components/save-job-button";

export interface JobDetailData {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  url: string | null;
  descriptionText: string;
  descriptionHtml: string | null;
}

export function JobDetailPane({ job }: { job: JobDetailData | null }) {
  if (!job) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground p-8">
        Select a job to see the details.
      </div>
    );
  }

  return (
    <div className="p-5 overflow-y-auto h-full">
      <div className="flex items-center gap-3">
        <CompanyLogo company={job.company} size={48} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{job.title}</h2>
          <p className="text-muted-foreground truncate">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
            {job.salary ? ` · ${job.salary}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <SaveJobButton jobId={job.id} />
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            View original ↗
          </a>
        )}
      </div>
      <MatchButton jobId={job.id} />

      <hr className="my-4 border-border" />

      {job.descriptionHtml ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          // Sanitized at ingest via sanitize-html (allowlisted tags only), so this is safe to render.
          dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
        />
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {job.descriptionText}
        </div>
      )}
    </div>
  );
}
