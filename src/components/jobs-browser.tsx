// src/components/jobs-browser.tsx
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobListItem, type JobListItemData } from "@/components/job-list-item";
import { JobDetailPane, type JobDetailData } from "@/components/job-detail-pane";
import { CompanyGroup, type BrowserGroup } from "@/components/company-group";
import { loadMoreJobs, loadMoreCompanies, getJobDetail } from "@/lib/jobs/actions";
import { type JobListRow } from "@/lib/jobs/constants";

export interface BrowserJob extends JobListItemData {
  url: string | null;
  descriptionText: string;
  descriptionHtml: string | null;
}

export function toBrowserJob(row: JobListRow): BrowserJob {
  return {
    id: row.id, title: row.title, company: row.company, location: row.location,
    salary: row.salary, url: row.url,
    postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : null,
    techTags: row.techTags, descriptionText: row.descriptionText,
    descriptionHtml: row.descriptionHtml,
  };
}

function toDetail(j: BrowserJob): JobDetailData {
  return {
    id: j.id, title: j.title, company: j.company, location: j.location,
    salary: j.salary, url: j.url, descriptionText: j.descriptionText,
    descriptionHtml: j.descriptionHtml,
  };
}

export function JobsBrowser({
  savedView, initialJobs, initialCursor, initialGroups, hasMoreCompanies, savedIds, hasFilters,
}: {
  savedView?: boolean;
  initialJobs?: BrowserJob[];
  initialCursor?: string | null;
  initialGroups?: BrowserGroup[];
  hasMoreCompanies?: boolean;
  savedIds: string[];
  hasFilters: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const saved = useMemo(() => new Set(savedIds), [savedIds]);

  const [jobs, setJobs] = useState<BrowserJob[]>(initialJobs ?? []);
  const [cursor, setCursor] = useState(initialCursor ?? null);

  const [groups, setGroups] = useState<BrowserGroup[]>(initialGroups ?? []);
  const [coPage, setCoPage] = useState(0);
  const [moreCos, setMoreCos] = useState(!!hasMoreCompanies);

  const [loading, setLoading] = useState(false);
  const [rolesById, setRolesById] = useState<Map<string, BrowserJob>>(() => {
    const m = new Map<string, BrowserJob>();
    (initialJobs ?? []).forEach((j) => m.set(j.id, j));
    (initialGroups ?? []).forEach((g) => g.topRoles.forEach((j) => m.set(j.id, j)));
    return m;
  });

  const registerRoles = useCallback((rows: BrowserJob[]) => {
    setRolesById((prev) => {
      const m = new Map(prev);
      rows.forEach((j) => m.set(j.id, j));
      return m;
    });
  }, []);

  const flatParams = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    sp.forEach((v, k) => { if (k !== "selected") f[k] = v; });
    return f;
  }, [sp]);

  const firstId = savedView ? jobs[0]?.id : groups[0]?.topRoles[0]?.id;
  const explicitSelected = sp.get("selected");
  const selectedId = explicitSelected ?? firstId ?? null;
  const selectedJob = selectedId ? rolesById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !rolesById.has(selectedId)) {
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

  async function moreJobs() {
    if (!cursor) return;
    setLoading(true);
    const res = await loadMoreJobs(flatParams, cursor);
    const mapped = res.jobs.map(toBrowserJob);
    setJobs((p) => [...p, ...mapped]);
    registerRoles(mapped);
    setCursor(res.nextCursor);
    setLoading(false);
  }
  async function moreCompanies() {
    setLoading(true);
    const next = coPage + 1;
    const res = await loadMoreCompanies(flatParams, next);
    const newGroups: BrowserGroup[] = res.groups.map((g) => ({
      company: g.company,
      totalCount: g.totalCount,
      topRoles: g.topRoles.map(toBrowserJob),
    }));
    setGroups((p) => [...p, ...newGroups]);
    newGroups.forEach((g) => registerRoles(g.topRoles));
    setCoPage(next);
    setMoreCos(res.hasMore);
    setLoading(false);
  }

  const isEmpty = savedView ? jobs.length === 0 : groups.length === 0;
  if (isEmpty) {
    if (savedView) {
      return <EmptyState title="No saved jobs yet" message="Tap the ☆ on a job to bookmark it and find it here." />;
    }
    return (
      <EmptyState
        title="No jobs match your filters"
        message={hasFilters ? "Try widening your filters, or switch the Level chip to “All levels.”" : "Try the Level chip → “All levels.”"}
      />
    );
  }

  const detail: JobDetailData | null = selectedJob ? toDetail(selectedJob) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border border-border rounded-lg overflow-hidden h-[calc(100vh-220px)]">
      <div className={`${explicitSelected ? "hidden md:flex" : "flex"} flex-col overflow-y-auto border-r border-border min-h-0`}>
        {savedView
          ? jobs.map((job) => (
              <JobListItem key={job.id} job={job} selected={job.id === selectedId} saved={saved.has(job.id)} onSelect={() => select(job.id)} />
            ))
          : groups.map((g) => (
              <CompanyGroup key={g.company} group={g} params={flatParams} selectedId={selectedId} savedIds={saved} onSelect={select} onRolesLoaded={registerRoles} />
            ))}
        {savedView && cursor && (
          <div className="p-3">
            <Button variant="outline" size="sm" onClick={moreJobs} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
        {!savedView && moreCos && (
          <div className="p-3">
            <Button variant="outline" size="sm" onClick={moreCompanies} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more companies"}
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
