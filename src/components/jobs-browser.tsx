// src/components/jobs-browser.tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobListItem, type JobListItemData } from "@/components/job-list-item";
import { JobDetailPane, type JobDetailData } from "@/components/job-detail-pane";
import { loadMoreJobs } from "@/lib/jobs/actions";
import { type JobListRow } from "@/lib/jobs/constants";

export interface BrowserJob extends JobListItemData {
  url: string | null;
  descriptionText: string;
}

function toBrowserJob(row: JobListRow): BrowserJob {
  return {
    id: row.id, title: row.title, company: row.company, location: row.location,
    salary: row.salary, url: row.url,
    postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : null,
    techTags: row.techTags, descriptionText: row.descriptionText,
  };
}

export function JobsBrowser({
  initialJobs,
  initialCursor,
  savedIds,
  hasFilters,
}: {
  initialJobs: BrowserJob[];
  initialCursor: string | null;
  savedIds: string[];
  hasFilters: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const saved = useMemo(() => new Set(savedIds), [savedIds]);

  const selectedId = sp.get("selected") ?? jobs[0]?.id ?? null;
  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  function select(id: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("selected", id);
    router.replace(`/jobs?${params.toString()}`, { scroll: false });
  }

  async function more() {
    if (!cursor) return;
    setLoading(true);
    const flat: Record<string, string | undefined> = {};
    sp.forEach((v, k) => { if (k !== "selected") flat[k] = v; });
    const res = await loadMoreJobs(flat, cursor);
    setJobs((prev) => [...prev, ...res.jobs.map(toBrowserJob)]);
    setCursor(res.nextCursor);
    setLoading(false);
  }

  if (jobs.length === 0) {
    return hasFilters ? (
      <EmptyState title="No jobs match your filters" message="Try widening or clearing your filters." />
    ) : (
      <EmptyState title="No jobs yet" message="Check back after the next ATS sync." />
    );
  }

  const detail: JobDetailData | null = selected
    ? {
        id: selected.id, title: selected.title, company: selected.company,
        location: selected.location, salary: selected.salary, url: selected.url,
        descriptionText: selected.descriptionText,
      }
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border border-border rounded-lg overflow-hidden h-[calc(100vh-220px)]">
      <div className="overflow-y-auto border-r border-border min-h-0">
        {jobs.map((job) => (
          <JobListItem
            key={job.id}
            job={job}
            selected={job.id === selectedId}
            saved={saved.has(job.id)}
            onSelect={() => select(job.id)}
          />
        ))}
        {cursor && (
          <div className="p-3">
            <Button variant="outline" size="sm" onClick={more} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
      <div className="hidden md:block min-h-0 h-full overflow-hidden">
        <JobDetailPane job={detail} />
      </div>
    </div>
  );
}
