// src/components/job-detail-pane.tsx
"use client";

import { useEffect, useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { MatchButton } from "@/components/match-button";
import { SaveJobButton } from "@/components/save-job-button";
import { Button } from "@/components/ui/button";
import { getJobDescription } from "@/lib/jobs/actions";

export interface JobDetailData {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  url: string | null;
  external: boolean; // aggregator listing — apply via original posting, no on-site description
}

type Description = { descriptionText: string; descriptionHtml: string | null };

export function JobDetailPane({ job }: { job: JobDetailData | null }) {
  const [desc, setDesc] = useState<Description | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // The heavy description is fetched on demand, so reset it whenever the
  // selected job changes — otherwise we'd show the previous job's text.
  useEffect(() => {
    setDesc(null);
    setLoaded(false);
    setLoading(false);
  }, [job?.id]);

  if (!job) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground p-8">
        Select a job to see the details.
      </div>
    );
  }

  const jobId = job.id;
  async function showDescription() {
    setLoading(true);
    const row = await getJobDescription(jobId);
    setDesc(row ?? { descriptionText: "", descriptionHtml: null });
    setLoaded(true);
    setLoading(false);
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
            {job.salary && (
              <>
                {" · "}
                <span className="font-semibold text-foreground px-0.5 [background:linear-gradient(transparent_60%,var(--highlight)_60%)]">
                  {job.salary}
                </span>
              </>
            )}
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
      <MatchButton jobId={job.id} hasDescription={!job.external} />

      <hr className="my-4 border-border" />

      {!loaded ? (
        <Button variant="outline" size="sm" onClick={showDescription} disabled={loading}>
          {loading ? "Loading…" : "Show full description"}
        </Button>
      ) : desc && (desc.descriptionHtml || desc.descriptionText.trim()) ? (
        desc.descriptionHtml ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-none"
            // Sanitized at ingest via sanitize-html (allowlisted tags only), so this is safe to render.
            dangerouslySetInnerHTML={{ __html: desc.descriptionHtml }}
          />
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {desc.descriptionText}
          </div>
        )
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No description provided.{job.url ? ' Use “View original ↗” above to read the full posting.' : ""}
        </p>
      )}
    </div>
  );
}
