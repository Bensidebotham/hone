# Applications — sortable columns, detail drawer & row context menu

**Date:** 2026-06-10
**Status:** Approved design, pending implementation plan

## Problem

The Applications power table (shipped 2026-06-09) covers the basics but three interactions fall short of "beats a spreadsheet":

1. **Sorting** is hidden behind a single dropdown. A spreadsheet sorts by clicking a column header, both directions. The table headers are inert.
2. **The detail view is thin.** Clicking a row opens a centered modal that is essentially an edit form — it doesn't read like a *summary of the role*. Feed-sourced jobs carry a full description we never surface here.
3. **No quick actions.** Changing status or opening a posting takes a click into the row or the status pill. A right-click menu is the spreadsheet-native shortcut.

## Goals

1. **Clickable sortable column headers** with a visible direction indicator; clicking the active column flips direction. Keep the existing Sort dropdown driving the same state.
2. **Replace the modal with a read-first slide-over drawer** that summarizes the job and role, with editing tucked behind an Edit toggle.
3. **Right-click row context menu** with: Change status ▸, Mark applied today, Open job posting, View / edit details, Delete.

## Non-goals (YAGNI)

- Multi-column / nested sort. One active sort key at a time.
- Bulk selection / bulk actions.
- Persisting sort/filter preference across reloads.
- Parsing salary strings better. Salary sort uses the existing enrichment `salaryMin`; unparsed rows sink to the bottom. No new salary parsing in this iteration.
- Editing the job description, or fetching descriptions for manually-added jobs.

## Decisions (locked)

| Question | Decision |
|---|---|
| Detail view format | Right-side slide-over drawer, read-first |
| Sort control | Sortable headers **and** keep the dropdown |
| Context menu actions | Change status, Mark applied today, Open job posting, View / edit details, Delete |
| Status sort order | Pipeline rank: saved → applied → interviewing → offer → rejected |
| Salary sort basis | `Job.salaryMin` (enrichment); nulls last |
| Drawer primitive | base-ui `dialog` styled as a right-side sheet (a new `ui/drawer.tsx` wrapper). The dedicated base-ui `drawer` is swipe/snap-point oriented for mobile bottom-sheets — heavier than a desktop right slide-over needs. |
| Context-menu primitive | base-ui `context-menu` (a new `ui/context-menu.tsx` wrapper) |

## Data model

No schema migration. Existing `Job` / `Application` fields are sufficient. `Job.salaryMin` (populated by `enrichJob` at ingest/seed) backs salary sort. `descriptionHtml` / `descriptionText` back the drawer summary.

## Architecture

### Sort logic — `src/lib/applications/table.ts` (pure, TDD)

Extend the sort surface to carry a direction and two new keys.

- `TableSort` key union becomes: `"company" | "status" | "applied" | "salary" | "lastActivity"`.
- New `SortDir = "asc" | "desc"`.
- New constant `DEFAULT_DIR: Record<TableSort, SortDir>` — `company: asc`, `status: asc`, `applied: desc`, `salary: desc`, `lastActivity: desc`.
- `sortApplications(apps, key, dir)` returns a new sorted array (never mutates). Comparators:
  - `company`: `localeCompare` on company, tiebreak title.
  - `status`: pipeline rank (`saved`=0 … `rejected`=4), tiebreak company.
  - `applied`: `appliedAt` time.
  - `salary`: `salaryMin`.
  - `lastActivity`: `updatedAt` time.
  - `dir === "asc"` reverses the comparator result for the **non-null** ordering only.
  - **Nulls always sort last**, in *both* directions (applied/salary): rows with a null value are partitioned to the end regardless of `dir`, so flipping direction never floats blank rows to the top. Direction orders only the rows that have a value.
- A small helper `nextSort(current, dir, clickedKey)` → `{ key, dir }`: clicking the active key flips `dir`; clicking a new key sets `key` + its `DEFAULT_DIR`. Used by both the headers and (implicitly) the dropdown.

Existing `filterApplications` and `summarize` are unchanged. `table.test.ts` is extended to cover the new keys, directions, null handling, and `nextSort`.

### Server action — `src/lib/applications/actions.ts`

Add `markAppliedToday(applicationId)`: sets `status: "applied"` and `appliedAt: new Date()` (always stamps today, even if already applied), scoped to the owning user via `updateMany`, then `revalidatePath("/applications")`. Mirrors the existing `updateStatus` ownership pattern. Existing actions unchanged.

### `ApplicationsTable` — `src/components/applications-table.tsx`

- State: replace `sort: TableSort` with `sort: TableSort` **plus** `dir: SortDir`. Derive rows via `sortApplications(filterApplications(...), sort, dir)`.
- **Headers:** each sortable `<th>` becomes a `<button>` with `aria-sort` and an ▲/▼ icon on the active column. Clicking calls `nextSort`. All five columns (Company/Role, Status, Applied, Salary, Last activity) are sortable.
- **Dropdown:** kept; selecting a key calls `nextSort` with the key (applies default dir).
- **Rows:** each row is wrapped by `ApplicationContextMenu` (below). Left-click still calls `openDetail`; the inline `StatusPill` cell still calls `handleStatus` and stops propagation. The context menu's "Change status" / "Mark applied today" reuse the existing optimistic `handleStatus` and a new optimistic `handleMarkApplied`, so right-click status changes get the same instant feedback + rollback.

### Detail drawer — `src/components/application-detail-panel.tsx`

Reworked from a centered `Dialog` to a right-side slide-over (via new `ui/drawer.tsx`, itself built on the base-ui `dialog` primitive). Read-first layout:

- **Header:** `CompanyLogo`, role title, company, live `StatusPill`, then a meta line: `salary · location · View original ↗` (link shown only when `url` present).
- **Summary section:** mirrors `JobDetailPane`'s render logic — if `descriptionHtml`, render it in a `prose` block (already sanitized at ingest); else if `descriptionText` trim, render preformatted text; else an italic *"No description — this role was added manually."* note.
- **Your tracking:** applied date, last activity (relative), and notes (read view; empty → muted placeholder).
- **Footer:** an **Edit** toggle reveals the existing editable form inline (applied date, notes; salary/location/url editable only for `source: "paste"`, with the existing read-only explainer for feed jobs). **Save** and **Delete** behave exactly as today (`updateApplicationDetails`, `deleteApplication`). Closing the drawer resets the edit toggle and transient error state.

The component keeps its name and `{ app, open, onOpenChange }` props so `ApplicationsTable` wiring is unchanged.

### `ApplicationContextMenu` — `src/components/application-context-menu.tsx` (new)

Wraps its children (a table row) in base-ui `context-menu`. Props: `app`, plus callbacks `onChangeStatus(status)`, `onMarkAppliedToday()`, `onViewDetails()`. Items:

- **Change status ▸** — submenu of the 5 statuses (reuses `KANBAN_COLUMNS` + the status dot styling from `status-pill.tsx`); current status disabled/checked.
- **Mark applied today** — calls `onMarkAppliedToday`.
- **Open job posting** — anchor to `app.job.url` in a new tab; disabled when `url` is null.
- **View / edit details** — calls `onViewDetails` (opens the drawer).
- *(separator)* **Delete** — destructive styling; calls `deleteApplication(app.id)` directly (same action the drawer uses).

### UI primitives (new thin wrappers, matching `ui/menu.tsx` style)

- `src/components/ui/drawer.tsx` — `Drawer`, `DrawerContent` (right-edge `Popup` with `slide-in-from-right` / `slide-out-to-right` animation + backdrop), `DrawerClose`, `DrawerTitle`. Built on `@base-ui/react/dialog` (same primitive as `ui/dialog.tsx`).
- `src/components/ui/context-menu.tsx` — `ContextMenu`, `ContextMenuTrigger`, `ContextMenuContent`, `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuSubmenu*` as needed. Built on `@base-ui/react/context-menu`. Styling reuses the `ui/menu.tsx` popup/item classes.

> Before implementing the `context-menu` wrapper, read the base-ui `context-menu` type definitions / docs (per `AGENTS.md`: this stack diverges from training data). Note `ContextMenu.Trigger` renders a `<div>`; mount it on the `<tr>` via the base-ui `render` prop. The drawer reuses the already-understood `dialog` primitive.

## Interactions preserved

- Left-click row → opens drawer (unchanged entry point).
- Inline status pill in the Status cell → unchanged.
- Add job dialog, stat tiles, search, filter chips, empty state → unchanged.
- Optimistic update + per-row rollback semantics for status changes → reused for context-menu status actions.

## Testing

- **Unit (vitest):** extend `src/lib/applications/table.test.ts` for the new sort keys (`status`, `salary`), both directions, null handling, and `nextSort` transitions. This is the core correctness surface.
- **Manual / visual:** seed data already loaded. Verify in the running app (authenticated) that headers sort + flip with the arrow indicator, the drawer reads well for both a feed job (description) and a manual job (no description), and the right-click menu fires each action including disabled Open-posting when no URL.

## Files

**Edit:** `src/lib/applications/table.ts`, `src/lib/applications/table.test.ts`, `src/lib/applications/actions.ts`, `src/components/applications-table.tsx`, `src/components/application-detail-panel.tsx`.

**Add:** `src/components/ui/drawer.tsx`, `src/components/ui/context-menu.tsx`, `src/components/application-context-menu.tsx`.
