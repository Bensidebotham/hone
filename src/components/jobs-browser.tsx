// src/components/jobs-browser.tsx
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobListItem } from "@/components/job-list-item";
import { JobDetailPane, type JobDetailData } from "@/components/job-detail-pane";
import { loadMoreJobs, getJobDetail } from "@/lib/jobs/actions";
import { toBrowserJob, type BrowserJob } from "@/components/job-browser-types";

export { toBrowserJob, type BrowserJob };

function toDetail(j: BrowserJob): JobDetailData {
  return {
    id: j.id, title: j.title, company: j.company, location: j.location,
    salary: j.salary, url: j.url, descriptionText: j.descriptionText,
    descriptionHtml: j.descriptionHtml,
  };
}

export function JobsBrowser({
  savedView, initialJobs, initialCursor, savedIds, hasFilters,
}: {
  savedView?: boolean;
  initialJobs?: BrowserJob[];
  initialCursor?: string | null;
  savedIds: string[];
  hasFilters: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const saved = useMemo(() => new Set(savedIds), [savedIds]);

  const [jobs, setJobs] = useState<BrowserJob[]>(initialJobs ?? []);
  const [cursor, setCursor] = useState(initialCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [rolesById, setRolesById] = useState<Map<string, BrowserJob>>(() => {
    const m = new Map<string, BrowserJob>();
    (initialJobs ?? []).forEach((j) => m.set(j.id, j));
    return m;
  });

  const registerRoles = useCallback((rows: BrowserJob[]) => {
    setRolesById((prev) => {
      const m = new Map(prev);
      rows.forEach((j) => m.set(j.id, j));
      return m;
    });
  }, []);

  const fetchedRef = useRef<string | null>(null);

  const flatParams = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    sp.forEach((v, k) => { if (k !== "selected") f[k] = v; });
    return f;
  }, [sp]);

  const firstId = jobs[0]?.id;
  const explicitSelected = sp.get("selected");
  const selectedId = explicitSelected ?? firstId ?? null;
  const selectedJob = selectedId ? rolesById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !rolesById.has(selectedId) && fetchedRef.current !== selectedId) {
      fetchedRef.current = selectedId;
      getJobDetail(selectedId).then((row) => {
        if (row) registerRoles([toBrowserJob(row)]);
      });
    }
  }, [selectedId, rolesById, registerRoles]);

  function select(id: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("selected", id);
    router.replace(`/jobs?${params.toString()}`, { scroll: false });
  }
  function clearSelection() {
    const params = new URLSearchParams(sp.toString());
    params.delete("selected");
    const qs = params.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
  }

  const moreJobs = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const res = await loadMoreJobs(flatParams, cursor);
    const mapped = res.jobs.map(toBrowserJob);
    setJobs((p) => [...p, ...mapped]);
    registerRoles(mapped);
    setCursor(res.nextCursor);
    setLoading(false);
  }, [cursor, loading, flatParams, registerRoles]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) moreJobs();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, moreJobs]);

  if (jobs.length === 0) {
    if (savedView) {
      return <EmptyState title="No saved jobs yet" message="Tap the ☆ on a job to bookmark it and find it here." />;
    }
    return (
      <EmptyState
        title={hasFilters ? "No jobs match your filters" : "No roles right now"}
        message={hasFilters ? `Try widening your filters, or switch the audience chip to "All roles."` : `Switch the audience chip to "All roles" to see more.`}
      />
    );
  }

  const detail: JobDetailData | null = selectedJob ? toDetail(selectedJob) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border border-border rounded-lg overflow-hidden h-[calc(100vh-220px)]">
      <div className={`${explicitSelected ? "hidden md:flex" : "flex"} flex-col overflow-y-auto border-r border-border min-h-0`}>
        {jobs.map((job) => (
          <JobListItem key={job.id} job={job} selected={job.id === selectedId} saved={saved.has(job.id)} onSelect={() => select(job.id)} />
        ))}
        {cursor && (
          <div ref={sentinelRef} className="p-3">
            <Button variant="outline" size="sm" onClick={moreJobs} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
      <div className={`${explicitSelected ? "flex" : "hidden"} md:flex flex-col min-h-0 h-full overflow-hidden`}>
        <button type="button" onClick={clearSelection} className="md:hidden flex items-center gap-1 px-4 py-2 text-sm text-primary border-b border-border">
          ← Back to results
        </button>
        <div className="flex-1 min-h-0">
          <JobDetailPane job={detail} />
        </div>
      </div>
    </div>
  );
}
