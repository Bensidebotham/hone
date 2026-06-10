"use client";

import { useState, useTransition, useEffect, useRef, useMemo } from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/empty-state";
import { ApplicationStatTiles } from "@/components/application-stat-tiles";
import { StatusPill } from "@/components/status-pill";
import { AddJobDialog } from "@/components/add-job-dialog";
import { ApplicationDetailPanel } from "@/components/application-detail-panel";
import { updateStatus, markAppliedToday, deleteApplication } from "@/lib/applications/actions";
import {
  filterApplications,
  sortApplications,
  summarize,
  nextSort,
  type TableFilter,
  type TableSort,
  type SortDir,
} from "@/lib/applications/table";
import { ApplicationContextMenu } from "@/components/application-context-menu";
import type { KanbanStatus } from "@/lib/applications/kanban";
import type { AppWithJob } from "@/app/(app)/applications/page";
import { cn } from "@/lib/utils";
import { CompanyLogo } from "@/components/company-logo";

const FILTERS: { key: TableFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "saved", label: "Saved" },
];

const SORTS: { key: TableSort; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "applied", label: "Applied date" },
  { key: "salary", label: "Salary" },
  { key: "lastActivity", label: "Last activity" },
];

const ROW_CLASS =
  "cursor-pointer border-t border-border/60 text-sm transition hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:outline-none";

function relative(date: Date): string {
  const days = Math.round((Date.now() - new Date(date).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function absolute(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}


export function ApplicationsTable({ applications }: { applications: AppWithJob[] }) {
  const [apps, setApps] = useState(applications);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TableFilter>("all");
  const [sort, setSort] = useState<TableSort>("lastActivity");
  const [dir, setDir] = useState<SortDir>("desc");
  const [detail, setDetail] = useState<AppWithJob | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pendingRef = useRef(0);

  useEffect(() => {
    if (pendingRef.current === 0) setApps(applications);
  }, [applications]);

  const rows = useMemo(
    () => sortApplications(filterApplications(apps, { search, filter }), sort, dir),
    [apps, search, filter, sort, dir]
  );
  const summary = useMemo(() => summarize(apps), [apps]);

  function applySort(key: TableSort) {
    const n = nextSort(sort, dir, key);
    setSort(n.key);
    setDir(n.dir);
  }

  function handleStatus(app: AppWithJob, next: KanbanStatus) {
    if (app.status === next) return;
    const prevStatus = app.status;
    const prevAppliedAt = app.appliedAt;
    // Mirror the server: moving to Applied (re-)stamps the applied date to now.
    const optimisticAppliedAt = next === "applied" ? new Date() : app.appliedAt;
    setApps((prev) =>
      prev.map((a) =>
        a.id === app.id ? { ...a, status: next, appliedAt: optimisticAppliedAt } : a
      )
    );
    setError(null);
    pendingRef.current++;
    startTransition(async () => {
      try {
        await updateStatus(app.id, next);
      } catch {
        // Revert only this row so concurrent changes to other rows survive.
        setApps((prev) =>
          prev.map((a) =>
            a.id === app.id ? { ...a, status: prevStatus, appliedAt: prevAppliedAt } : a
          )
        );
        setError("Failed to update status. Please try again.");
      } finally {
        pendingRef.current--;
      }
    });
  }

  function handleMarkApplied(app: AppWithJob) {
    const prevStatus = app.status;
    const prevAppliedAt = app.appliedAt;
    const now = new Date();
    setApps((prev) =>
      prev.map((a) => (a.id === app.id ? { ...a, status: "applied", appliedAt: now } : a))
    );
    setError(null);
    pendingRef.current++;
    startTransition(async () => {
      try {
        await markAppliedToday(app.id);
      } catch {
        setApps((prev) =>
          prev.map((a) =>
            a.id === app.id ? { ...a, status: prevStatus, appliedAt: prevAppliedAt } : a
          )
        );
        setError("Failed to update. Please try again.");
      } finally {
        pendingRef.current--;
      }
    });
  }

  function handleDelete(app: AppWithJob) {
    setApps((prev) => prev.filter((a) => a.id !== app.id));
    // Close the detail drawer if it's showing the row we just removed.
    if (detail?.id === app.id) setDetailOpen(false);
    setError(null);
    pendingRef.current++;
    startTransition(async () => {
      try {
        await deleteApplication(app.id);
      } catch {
        // Re-insert just this row on failure; ordering is recomputed by the
        // sort, so concurrent changes to other rows are preserved.
        setApps((prev) => (prev.some((a) => a.id === app.id) ? prev : [...prev, app]));
        setError("Failed to delete. Please try again.");
      } finally {
        pendingRef.current--;
      }
    });
  }

  function openDetail(app: AppWithJob) {
    setDetail(app);
    setDetailOpen(true);
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-5">
        <ApplicationStatTiles summary={summary} />

        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              aria-label="Dismiss error"
              className="ml-auto text-destructive/70 hover:text-destructive"
            >
              ×
            </button>
          </div>
        )}

        {/* Toolbar */}
        {apps.length > 0 && (<div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or role…"
              aria-label="Search applications"
              className="h-9 flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                filter === f.key
                  ? "border-primary/30 bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted"
              )}
            >
              {f.label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => applySort(e.target.value as TableSort)}
            aria-label="Sort applications"
            className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sort: {s.label}
              </option>
            ))}
          </select>
        </div>)}

        {/* Table or empty state */}
        {apps.length === 0 ? (
          <EmptyState
            title="No applications yet"
            message="Track a role you applied to anywhere — it doesn't have to come from this app."
            action={<AddJobDialog />}
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {([
                    { key: "company", label: "Company / Role" },
                    { key: "status", label: "Status" },
                    { key: "applied", label: "Applied" },
                    { key: "salary", label: "Salary" },
                    { key: "lastActivity", label: "Last activity" },
                  ] as { key: TableSort; label: string }[]).map((col) => (
                    <th key={col.key} className="px-4 py-3" aria-sort={sort === col.key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                      <button
                        type="button"
                        onClick={() => applySort(col.key)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground"
                      >
                        {col.label}
                        {sort === col.key &&
                          (dir === "asc" ? (
                            <ChevronUp className="size-3" />
                          ) : (
                            <ChevronDown className="size-3" />
                          ))}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((app) => (
                  <ApplicationContextMenu
                    key={app.id}
                    app={app}
                    rowClassName={ROW_CLASS}
                    onOpenDetail={() => openDetail(app)}
                    onChangeStatus={(next) => handleStatus(app, next)}
                    onMarkAppliedToday={() => handleMarkApplied(app)}
                    onDelete={() => handleDelete(app)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CompanyLogo company={app.job.company} size={36} />
                        <div>
                          <div className="font-semibold">{app.job.company}</div>
                          <div className="text-xs text-muted-foreground">{app.job.title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <StatusPill
                        status={app.status as KanbanStatus}
                        onChange={(next) => handleStatus(app, next)}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{absolute(app.appliedAt)}</td>
                    <td className="px-4 py-3 font-medium">{app.job.salary ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{relative(app.updatedAt)}</td>
                  </ApplicationContextMenu>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      No applications match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ApplicationDetailPanel app={detail} open={detailOpen} onOpenChange={setDetailOpen} />
    </TooltipProvider>
  );
}
