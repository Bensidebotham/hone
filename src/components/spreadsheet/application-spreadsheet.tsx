"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Search } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/empty-state";
import { ApplicationStatTiles } from "@/components/application-stat-tiles";
import { AddJobDialog } from "@/components/add-job-dialog";
import { ApplicationDetailPanel } from "@/components/application-detail-panel";
import { SpreadsheetRow } from "./spreadsheet-row";
import { ColumnMenu } from "./column-menu";
import { BulkActionBar } from "./bulk-action-bar";
import {
  filterApplications, sortApplications, summarize, nextSort,
  type TableFilter, type TableSort, type SortDir,
} from "@/lib/applications/table";
import { resolveColumns, type ColumnDef, type ColumnId, type TablePrefs } from "@/lib/applications/columns";
import { reduceGrid, INITIAL_GRID } from "@/lib/applications/grid-nav";
import { rangeIds } from "@/lib/applications/selection";
import {
  updateStatus, updateApplicationFields,
  bulkUpdateStatus, bulkMarkApplied, bulkDelete, saveColumnPrefs,
} from "@/lib/applications/actions";
import type { KanbanStatus } from "@/lib/applications/kanban";
import type { ApplicationRow } from "@/app/(app)/applications/page";
import { cn } from "@/lib/utils";

const FILTERS: { key: TableFilter; label: string }[] = [
  { key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "saved", label: "Saved" },
];

// Map a column id to the TableSort key (only sortable columns).
const SORT_KEY: Partial<Record<ColumnId, TableSort>> = {
  company: "company", status: "status", appliedAt: "applied", followUpDate: "followUpDate",
  salary: "salary", source: "source", contact: "contact", nextStep: "nextStep", lastActivity: "lastActivity",
};

function parseDate(iso: string): Date | null {
  if (!iso.trim()) return null;
  const [y, m, dd] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  return isNaN(d.getTime()) ? null : d;
}

export function ApplicationSpreadsheet({
  applications, prefs, tailoredIds,
}: { applications: ApplicationRow[]; prefs: TablePrefs | null; tailoredIds?: Set<string> }) {
  const [apps, setApps] = useState(applications);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TableFilter>("all");
  const [sort, setSort] = useState<TableSort>("lastActivity");
  const [dir, setDir] = useState<SortDir>("desc");
  const [columns, setColumns] = useState<ColumnDef[]>(() => resolveColumns(prefs));
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [grid, dispatch] = useReducer(reduceGrid, INITIAL_GRID);
  const [seed, setSeed] = useState<string | undefined>(undefined);
  const [detail, setDetail] = useState<ApplicationRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef(0);

  useEffect(() => { if (pendingRef.current === 0) setApps(applications); }, [applications]);

  const rows = useMemo(
    () => sortApplications(filterApplications(apps, { search, filter }), sort, dir),
    [apps, search, filter, sort, dir]
  );
  const summary = useMemo(() => summarize(apps), [apps]);
  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // Prune selection when the visible rows change (e.g. search/filter) so bulk
  // actions never operate on rows the user can no longer see.
  useEffect(() => {
    setSelection((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(rowIds);
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rowIds]);

  // ---- optimistic field commit ----
  function runOptimistic(appId: string, patch: Partial<ApplicationRow>, action: () => Promise<void>, revert: Partial<ApplicationRow>) {
    setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, ...patch } : a)));
    setError(null);
    pendingRef.current++;
    action().catch(() => {
      setApps((prev) => prev.map((a) => (a.id === appId ? { ...a, ...revert } : a)));
      setError("Update failed. Please try again.");
    }).finally(() => { pendingRef.current--; });
  }

  function commitCell(app: ApplicationRow, column: ColumnDef, value: string) {
    if (!column.field || !column.editable) return;
    const field = column.field;
    if (column.kind === "date") {
      const parsed = parseDate(value);
      const prev = app[field] as Date | null;
      runOptimistic(app.id, { [field]: parsed } as Partial<ApplicationRow>,
        () => updateApplicationFields(app.id, { [field]: parsed } as never),
        { [field]: prev } as Partial<ApplicationRow>);
    } else {
      const trimmed = value.trim();
      const next = trimmed || null;
      const prev = app[field] as string | null;
      // company/title must not be blanked
      if ((field === "company" || field === "title") && !next) return;
      runOptimistic(app.id, { [field]: next } as Partial<ApplicationRow>,
        () => updateApplicationFields(app.id, { [field]: trimmed } as never),
        { [field]: prev } as Partial<ApplicationRow>);
    }
  }

  function handleStatus(app: ApplicationRow, next: KanbanStatus) {
    if (app.status === next) return;
    const prevStatus = app.status;
    const prevApplied = app.appliedAt;
    const optimisticApplied = next === "applied" ? new Date() : app.appliedAt;
    runOptimistic(app.id, { status: next, appliedAt: optimisticApplied },
      () => updateStatus(app.id, next), { status: prevStatus, appliedAt: prevApplied });
  }

  // ---- selection ----
  function toggleRow(app: ApplicationRow, e: React.MouseEvent) {
    e.preventDefault();
    setSelection((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && anchor) {
        for (const id of rangeIds(rowIds, anchor, app.id)) next.add(id);
      } else {
        if (next.has(app.id)) next.delete(app.id); else next.add(app.id);
        setAnchor(app.id);
      }
      return next;
    });
  }
  const allSelected = rows.length > 0 && rows.every((r) => selection.has(r.id));
  function toggleAll() {
    setSelection(allSelected ? new Set() : new Set(rowIds));
  }
  function clearSelection() { setSelection(new Set()); }

  // ---- bulk ----
  // `mutate` transforms the current rows into the optimistic next state (patch fields
  // or filter out deleted rows). On failure we restore every affected row to its
  // pre-mutation snapshot, re-inserting any that were optimistically removed.
  function bulk(mutate: (prev: ApplicationRow[]) => ApplicationRow[], action: (ids: string[]) => Promise<void>) {
    const ids = [...selection];
    if (ids.length === 0) return;
    const prevById = new Map(apps.filter((a) => selection.has(a.id)).map((a) => [a.id, a]));
    setApps(mutate);
    setError(null);
    pendingRef.current++;
    action(ids).catch(() => {
      setApps((current) => {
        const currentIds = new Set(current.map((a) => a.id));
        const restored = current.map((a) => (prevById.has(a.id) ? prevById.get(a.id)! : a));
        const reinserted = ids.filter((id) => !currentIds.has(id) && prevById.has(id)).map((id) => prevById.get(id)!);
        return [...restored, ...reinserted];
      });
      setError("Bulk action failed. Refresh to re-sync.");
    }).finally(() => { pendingRef.current--; });
    clearSelection();
  }

  // ---- columns ----
  function applyColumns(next: { order: ColumnId[]; hidden: ColumnId[] }) {
    const prevColumns = columns;
    setColumns(resolveColumns(next));
    saveColumnPrefs(next).catch(() => {
      setColumns(prevColumns);
      setError("Could not save column layout.");
    });
  }

  // ---- keyboard ----
  function onGridKeyDown(e: React.KeyboardEvent) {
    // Grid navigation only applies to keys originating inside the grid table —
    // e.g. the toolbar's search input must retain normal typing/cursor behavior.
    if (!(e.target as HTMLElement).closest("table")) return;
    const cols = columns.length;
    const rowsN = rows.length;
    if (!grid.active) return;
    const col = columns[grid.active.c];
    if (grid.editing) {
      // input handles its own keys; only intercept nothing here
      return;
    }
    if (e.key === "ArrowUp") { e.preventDefault(); dispatch({ type: "move", dr: -1, dc: 0, rows: rowsN, cols }); }
    else if (e.key === "ArrowDown") { e.preventDefault(); dispatch({ type: "move", dr: 1, dc: 0, rows: rowsN, cols }); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); dispatch({ type: "move", dr: 0, dc: -1, rows: rowsN, cols }); }
    else if (e.key === "ArrowRight") { e.preventDefault(); dispatch({ type: "move", dr: 0, dc: 1, rows: rowsN, cols }); }
    else if (e.key === "Tab") { e.preventDefault(); dispatch({ type: "tab", dir: e.shiftKey ? -1 : 1, rows: rowsN, cols }); }
    else if (e.key === "Enter") { if (col?.editable) { e.preventDefault(); setSeed(undefined); dispatch({ type: "beginEdit" }); } }
    else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && col?.editable && col.kind !== "date" && col.kind !== "status") {
      e.preventDefault(); setSeed(e.key); dispatch({ type: "beginEdit" });
    }
  }

  function onCommitCell(rowIndex: number, c: number, value: string) {
    const app = rows[rowIndex];
    const column = columns[c];
    if (app && column) commitCell(app, column, value);
    dispatch({ type: "commitMoveDown", rows: rows.length });
  }

  function openDetail(app: ApplicationRow) { setDetail(app); setDetailOpen(true); }

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-5" onKeyDown={onGridKeyDown}>
        <ApplicationStatTiles summary={summary} />

        {error && (
          <div role="alert" aria-live="assertive" className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="ml-auto">×</button>
          </div>
        )}

        {apps.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3">
              <Search className="size-4 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company or role…"
                aria-label="Search applications" className="h-9 flex-1 bg-transparent text-sm outline-none" />
            </div>
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                className={cn("rounded-lg border px-3 py-2 text-xs font-semibold transition",
                  filter === f.key ? "border-primary/30 bg-accent text-accent-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted")}>
                {f.label}
              </button>
            ))}
            <ColumnMenu columns={columns} onChange={applyColumns} />
          </div>
        )}

        {selection.size > 0 && (
          <BulkActionBar
            count={selection.size}
            onSetStatus={(s) => bulk(
              (prev) => prev.map((a) => (selection.has(a.id) ? { ...a, status: s } : a)),
              (ids) => bulkUpdateStatus(ids, s)
            )}
            onMarkApplied={() => bulk(
              (prev) => prev.map((a) => (selection.has(a.id) ? { ...a, status: "applied", appliedAt: new Date() } : a)),
              (ids) => bulkMarkApplied(ids)
            )}
            onDelete={() => bulk(
              (prev) => prev.filter((a) => !selection.has(a.id)),
              (ids) => bulkDelete(ids)
            )}
            onClear={clearSelection}
          />
        )}

        {apps.length === 0 ? (
          <EmptyState title="No applications yet"
            message="Track a role you applied to anywhere — it doesn't have to come from this app."
            action={<AddJobDialog />} />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/40 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="w-9 px-2 py-3 text-center">
                    <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  {columns.map((col) => {
                    const key = SORT_KEY[col.id];
                    const sortState = col.sortable && key
                      ? (sort === key ? (dir === "asc" ? "ascending" : "descending") : "none")
                      : undefined;
                    return (
                      <th key={col.id} className="px-3 py-3" aria-sort={sortState}>
                        {col.sortable && key ? (
                          <button type="button" onClick={() => { const n = nextSort(sort, dir, key); setSort(n.key); setDir(n.dir); }}
                            className="uppercase tracking-wide hover:text-foreground">
                            {col.label}{sort === key ? (dir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        ) : col.label}
                      </th>
                    );
                  })}
                  <th className="w-9 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((app, r) => (
                  <SpreadsheetRow
                    key={app.id}
                    app={app}
                    rowIndex={r}
                    columns={columns}
                    selected={selection.has(app.id)}
                    active={grid.active}
                    editing={grid.editing}
                    seed={seed}
                    onSelectChange={(e) => toggleRow(app, e)}
                    onActivateCell={(c) => dispatch({ type: "activate", r, c })}
                    onBeginEditCell={(c, s) => { dispatch({ type: "activate", r, c }); setSeed(s); dispatch({ type: "beginEdit" }); }}
                    onCommitCell={(c, v) => onCommitCell(r, c, v)}
                    onCancelEdit={() => dispatch({ type: "cancelEdit" })}
                    onStatusChange={(s) => handleStatus(app, s)}
                    onExpand={() => openDetail(app)}
                  />
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 2} className="px-4 py-10 text-center text-sm text-muted-foreground">No applications match your filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ApplicationDetailPanel
        app={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        tailored={detail ? (tailoredIds?.has(detail.id) ?? false) : false}
      />
    </TooltipProvider>
  );
}
