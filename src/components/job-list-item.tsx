"use client";

import { useOptimistic, useTransition } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { toggleSavedJob } from "@/lib/jobs/saved";

export interface JobListItemData {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  postedAt: string | null; // ISO string (serialized for the client)
  techTags: string[];
  external: boolean; // aggregator-sourced listing (no on-site description; apply via original posting)
}

function postedAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function JobListItem({
  job,
  selected,
  saved,
  onSelect,
}: {
  job: JobListItemData;
  selected: boolean;
  saved: boolean;
  onSelect: () => void;
}) {
  const [isSaved, setOptimisticSaved] = useOptimistic(saved);
  const [, startTransition] = useTransition();

  function bookmark(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      setOptimisticSaved(!isSaved);
      await toggleSavedJob(job.id);
    });
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left flex gap-3 p-3 border-b border-border transition-colors ${
        selected ? "bg-accent border-l-2 border-l-primary" : "hover:bg-muted/50"
      }`}
    >
      <CompanyLogo company={job.company} size={36} />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{job.title}</div>
        <div className="text-sm text-muted-foreground truncate">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
          {job.external && (
            <span className="ml-1.5 align-middle text-[0.6rem] uppercase tracking-wide rounded border border-border px-1 py-0.5 text-muted-foreground">
              External ↗
            </span>
          )}
        </div>
        <div className="text-sm">
          {job.salary && <span className="text-green-600">{job.salary}</span>}
          {job.salary && job.postedAt ? " · " : ""}
          <span className="text-muted-foreground">{postedAgo(job.postedAt)}</span>
        </div>
        {job.techTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {job.techTags.slice(0, 4).map((t) => (
              <span key={t} className="text-[0.65rem] bg-muted rounded px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        )}
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={bookmark}
        onKeyDown={(e) => { if (e.key === "Enter") bookmark(e as unknown as React.MouseEvent); }}
        aria-label={isSaved ? "Remove bookmark" : "Bookmark job"}
        aria-pressed={isSaved}
        className="text-lg leading-none text-amber-500 shrink-0"
      >
        {isSaved ? "★" : "☆"}
      </span>
    </button>
  );
}
