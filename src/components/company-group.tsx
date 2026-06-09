"use client";

import { useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { JobListItem } from "@/components/job-list-item";
import { loadCompanyRoles } from "@/lib/jobs/actions";
import { toBrowserJob, type BrowserJob } from "@/components/job-browser-types";

export interface BrowserGroup {
  company: string;
  totalCount: number;
  topRoles: BrowserJob[];
}

export function CompanyGroup({
  group, params, selectedId, savedIds, onSelect, onRolesLoaded,
}: {
  group: BrowserGroup;
  params: Record<string, string | undefined>;
  selectedId: string | null;
  savedIds: Set<string>;
  onSelect: (id: string) => void;
  onRolesLoaded: (rows: BrowserJob[]) => void;
}) {
  const [extra, setExtra] = useState<BrowserJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const shown = [...group.topRoles, ...extra];
  const remaining = group.totalCount - shown.length;

  async function showMore() {
    setLoading(true);
    const rows = await loadCompanyRoles(group.company, params);
    const mapped = rows.map(toBrowserJob);
    setExtra(mapped);
    setExpanded(true);
    onRolesLoaded(mapped);
    setLoading(false);
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
        <CompanyLogo company={group.company} size={24} />
        <span className="font-medium text-sm">{group.company}</span>
        <span className="text-xs text-muted-foreground">
          {group.totalCount} {group.totalCount === 1 ? "role" : "roles"}
        </span>
      </div>
      {shown.map((job) => (
        <JobListItem
          key={job.id}
          job={job}
          selected={job.id === selectedId}
          saved={savedIds.has(job.id)}
          onSelect={() => onSelect(job.id)}
        />
      ))}
      {!expanded && remaining > 0 && (
        <button
          type="button"
          onClick={showMore}
          disabled={loading}
          className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-muted/50 disabled:opacity-50"
        >
          {loading ? "Loading…" : `Show ${remaining} more at ${group.company}`}
        </button>
      )}
    </div>
  );
}
