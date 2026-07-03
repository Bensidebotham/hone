# Spreadsheet tracker — upgrade the applications table

**Date:** 2026-07-03
**Status:** Approved (design)
**Sub-project 2 of 4** in the Hone pivot. Sequence: (1) remove job search ✅ → (2) **spreadsheet tracker** → (3) resume-per-job tailoring → (4) Chrome extension.

## Why

The live applications tracker is already a sortable/filterable power-table (search, filter chips, sortable headers, inline status pill, right-click menu, row → detail drawer). Only **status** is editable inline; every other field requires opening the detail drawer. For tracking a real search at volume, that is slow. This project turns the table into a **spreadsheet-grade editor**: inline cell editing, keyboard navigation, bulk actions, and per-user column configuration — plus job-native columns a generic spreadsheet lacks.

An orphaned `application-kanban.tsx` component still exists in the repo but is rendered nowhere (a prior redesign moved the tracker to the table). This project deletes that dead code.

## Goals

- Every scalar field editable **inline** in the grid (click / Enter / type).
- **Keyboard navigation** across cells (arrows, Tab, Enter, Esc) like a spreadsheet.
- **Bulk** row selection (checkbox, shift-range, select-all) with bulk status / mark-applied / delete.
- **Column configuration** per user: show/hide + drag-reorder a curated catalog, persisted.
- Add job-native columns: **follow-up date, source, contact, next step**.
- Preserve the existing look (shadcn/Base UI), the per-row optimistic-update behavior, the stat tiles, and the detail drawer (for long text + full view).
- Delete the dead kanban component.

## Non-goals

- User-defined custom fields (dynamic schema). The catalog is code-defined; users only show/hide/reorder it.
- Row virtualization (dataset is a personal tracker — tens to low-hundreds of rows).
- A mobile-optimized grid. Desktop-first; the grid scrolls horizontally on narrow screens and the drawer remains the mobile edit path.
- Resume tailoring / extension (later sub-projects).

## Design

### 1. Data model

Add four nullable columns to `Application` (additive migration — no reset):

```prisma
followUpDate DateTime?
source       String?
contact      String?
nextStep     String?
```

Add per-user column config to `User`:

```prisma
applicationTablePrefs Json?   // shape: { order: ColumnId[]; hidden: ColumnId[] }
```

Both `order` and `hidden` are optional inside the JSON. Effective columns are computed by a pure function (below), so a null/partial value is always valid.

### 2. Column catalog — `src/lib/applications/columns.ts`

A typed catalog is the single source of truth for what columns exist. Each entry:

```ts
type ColumnKind = "company" | "role" | "status" | "date" | "text" | "lastActivity";
interface ColumnDef {
  id: ColumnId;          // stable string id
  label: string;
  kind: ColumnKind;
  field?: keyof Application; // the Application field it reads/writes (omit for lastActivity)
  editable: boolean;
  sortable: boolean;
}
```

Catalog (ids): `company`, `role`, `status`, `appliedAt`, `followUpDate`, `salary`, `source`, `contact`, `nextStep`, `location`, `url`, `notes`, `lastActivity`.

- The old combined "Company / Role" cell is **split** into two columns: `company` (renders `CompanyLogo` + editable company text) and `role` (editable title text).
- `status` renders the existing `StatusPill`. `appliedAt`/`followUpDate` are date cells (`followUpDate` in the past renders red). `salary/source/contact/nextStep/location/url/notes` are single-line text cells. `lastActivity` is read-only relative time (sortable, not editable).
- `description` is deliberately **not** in the catalog — it is long job-posting text edited only in the drawer.

**Default visible order:** `company, role, status, appliedAt, followUpDate, salary, source, lastActivity`. The rest (`contact, nextStep, location, url, notes`) ship hidden.

**Resolver:** `resolveColumns(prefs: TablePrefs | null): ColumnDef[]`
- Start from the catalog. Apply `prefs.order` (catalog ids not present in `order` are appended in catalog order — so future columns appear by default). Remove ids in `prefs.hidden`. If `prefs` is null, return the default-visible list in default order.
- Pure, unit-tested.

### 3. Server actions — `src/lib/applications/actions.ts`

- Generalize the existing `updateApplicationDetails` into **`updateApplicationFields(id, partial)`** accepting any editable scalar: `company`, `title`, `salary`, `location`, `url`, `source`, `contact`, `nextStep`, `followUpDate` (Date | null), `appliedAt` (Date | null), `notes`. Trims strings to `null` when empty; `undefined` fields are skipped (partial update, no clobber). Ownership-scoped (`where: { id, userId }`). Does **not** record events (only status changes do).
- Status stays on the existing `updateStatus(id, status)` (records an `ApplicationEvent`). Inline status edits call it.
- **Bulk actions:**
  - `bulkUpdateStatus(ids: string[], status)` — per-id status update, each recording a `status_change` event (loop; skip ids already at that status).
  - `bulkMarkApplied(ids)` — set applied + stamp date, record events.
  - `bulkDelete(ids)` — `deleteMany({ where: { id: { in: ids }, userId } })`.
  - All revalidate `/applications`.
- **`saveColumnPrefs(prefs: TablePrefs)`** — writes `User.applicationTablePrefs` for the current user; revalidates `/applications`.

### 4. Interaction layer

Two focused hooks under `components/spreadsheet/`:

- **`use-grid-navigation.ts`** — a reducer over `{ active: {row,col} | null, editing: boolean }`. Handles arrow moves (clamped to grid bounds over the *visible* columns and *filtered/sorted* rows), Tab/Shift-Tab (horizontal, wrap to next/prev row), Enter (commit + move down; if not editing, enter edit), typing a printable char (enter edit seeded with the char), Esc (cancel edit). Read-only columns (`lastActivity`) are navigable but not editable.
- **`use-cell-editing.ts`** — owns the draft value + commit/cancel. Commit → optimistic `setApps` patch + the relevant server action; on failure, revert that row and surface the existing inline error banner. Mirrors the current optimistic pattern in `applications-table.tsx`.

**Selection/bulk:** selection state is a `Set<string>` of row ids in the top component. Checkbox column toggles; shift-click computes the range against the last-clicked anchor over the *currently rendered* row order; header checkbox selects/clears all filtered rows. When `size > 0`, render `bulk-action-bar.tsx`.

### 5. Components — `src/components/spreadsheet/`

- **`application-spreadsheet.tsx`** — top-level client component (replaces `applications-table.tsx`). Owns `apps`, `selection`, grid nav + editing hooks, `columns` (from `resolveColumns(prefs)` + local reorders), search/filter/sort. Renders stat tiles, toolbar (search + filter chips + sort + Columns menu), optional bulk bar, and the grid (`<table>`).
- **`spreadsheet-row.tsx`** — checkbox + one `SpreadsheetCell` per visible column + a row expand affordance (opens the detail drawer).
- **`spreadsheet-cell.tsx`** — renders display vs. edit mode by `column.kind`; wires active-cell ring, click-to-edit, and commit.
- **`column-menu.tsx`** — popover listing catalog columns with checkboxes (show/hide) and drag handles (reorder, via the existing `@dnd-kit`); persists via `saveColumnPrefs` (optimistic).
- **`bulk-action-bar.tsx`** — appears on selection: Set status ▾ · Mark applied today · Delete.

Reused as-is: `StatusPill`, `CompanyLogo`, `ApplicationStatTiles`, `ApplicationDetailPanel`, `EmptyState`, `AddJobDialog`. The detail drawer keeps its `description`/`notes`/full-view role, opened by the row expand affordance.

### 6. Filtering / sorting — `src/lib/applications/table.ts`

Keep `filterApplications`, `summarize`, `nextSort`. Extend `TableSort` and `sortApplications` for the new sortable columns (`followUpDate` date-sort nulls-last; `source`/`contact`/`nextStep` lexical). Salary sort keeps the free-text `parseSalaryRange` path.

### 7. Cleanup

- Delete `src/components/application-kanban.tsx` and its test (orphaned — rendered nowhere).
- Remove `groupByStatus` and `moveApplication` from `src/lib/applications/kanban.ts` if no longer referenced after the kanban component is gone (grep to confirm). **Keep** `kanban.ts` otherwise — it is the status source of truth (`KANBAN_STATUSES`, `KANBAN_COLUMNS`, `KanbanStatus`, `isKanbanStatus`) used by `StatusPill`, `add-job-dialog`, the page, and the grid.
- Update `src/app/(app)/applications/loading.tsx` (skeleton currently references "kanban columns").
- `src/app/(app)/applications/page.tsx` fetches apps **and** the user's `applicationTablePrefs`, and renders `<ApplicationSpreadsheet applications={apps} prefs={prefs} />`.

### 8. Page integration

`applications/page.tsx` (Server Component) selects the user's `applicationTablePrefs` alongside the applications query and passes both down. `ApplicationRow` stays `= Application`, now including the four new fields automatically.

## Testing

- **Pure logic:** `resolveColumns` (default when null; order applied; hidden removed; unknown/new catalog id appended-visible); new-column sorting (followUpDate nulls-last, lexical text); grid-navigation reducer (arrow clamp, Tab wrap, Enter-commits-and-moves-down, type-to-edit, Esc-cancel, read-only cells not editable); shift-click range selection.
- **Components:** cell edit commits → optimistic patch + correct action called; failed commit reverts the row + shows error; keyboard nav moves the active cell; bulk bar triggers the bulk action for the selected ids; column menu show/hide/reorder persists.
- **Actions:** `updateApplicationFields` partial update (no clobber of omitted fields; trims empties to null); bulk actions record events / delete scoped to the user; `saveColumnPrefs` writes the blob.
- Green gate: `npx tsc --noEmit`, `npm test`, `next build` all pass.

## Risks / notes

- **Keyboard nav complexity** is the main risk; isolating it in a tested reducer (`use-grid-navigation`) keeps it bounded and independently verifiable.
- **Optimistic + server round-trips per keystroke-commit:** commit only on Enter/blur (not per keystroke) to avoid action spam.
- **`applications-table.tsx` is replaced**, not extended in place, so the new grid stays focused; the old file is removed once the spreadsheet reaches parity (status pill, context menu, stat tiles, search/filter/sort, detail drawer, optimistic updates, empty state all carried over).
- Column-prefs JSON is validated by `resolveColumns` (ignores unknown ids), so a stale/corrupt blob degrades gracefully to defaults rather than breaking the page.
