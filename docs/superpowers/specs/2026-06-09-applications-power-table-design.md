# Applications — Power Table redesign

**Date:** 2026-06-09
**Status:** Approved design, pending implementation plan

## Problem

The Applications page is the heart of the product's value proposition: a better way to track a job search than the Google Sheet most people use today. The current implementation is a 5-column drag-and-drop Kanban board. A board is good for visualizing a funnel but loses to a spreadsheet on the three things that actually matter at scale: **density** (seeing many applications at once), **sorting**, and **filtering/scanning**. Past ~20 applications the columns become tall scroll-tubes you can't sort or compare.

We also force every application to originate from a Job ingested through our app. Users routinely apply to roles we never saw, so the tracker is incomplete unless they can add a job manually.

Finally, the page lives last in the sidebar despite being one of the app's primary surfaces.

## Goals

1. Replace the Kanban board with a modern **power table** as the primary (and only) view.
2. Let users **add a job manually**, without it having been ingested by the app.
3. Promote **Applications to the 2nd sidebar slot**, right after Dashboard.
4. Keep parity with everything the board did: change status, edit notes, open the posting.

## Non-goals (YAGNI for this iteration)

- Keeping or toggling to the Kanban board. We **drop the board as a route view** but leave its code (`application-kanban.tsx`, `application-card.tsx`, `lib/applications/kanban.ts`) in the repo so it can be revived as a toggle later. Nothing imports it after this change.
- A compact/comfortable density switch. Ship comfortable rows only.
- Full inline editing of every cell. Status is editable inline; everything else is edited in a row detail panel.
- Bulk actions, CSV import/export, reminders/notifications.

## Decisions (locked)

| Question | Decision |
|---|---|
| Primary layout | Power table (option B) |
| Visual direction | Modern: logo tiles, status pills with dots, stat tiles, toolbar — per approved mockup |
| Add-job form fields | **Standard set**: Company, Role, Status, Job URL, Salary, Location, Applied date, Notes |
| Kanban board | Drop as a view; keep code dormant |
| Sidebar position | 2nd, after Dashboard |
| Row density | Comfortable only |

## Data model

No schema migration required. The existing models already support this:

- A manual add creates a `Job` with `source: "paste"`, `userId` set, `company`, `title`, and the optional `location` / `url` / `salary` (freeform string) — `descriptionText` defaults to `""`. Then an `Application` is created linking that job, with `status`, `appliedAt`, and `notes`.
- Applications created from the Jobs page (existing `addApplication(jobId)` flow, `source: "ats"`) continue to work unchanged. The table shows both kinds identically.

**Deleting an application** removes the `Application`. If its `Job` is `source: "paste"` and has no other applications, the orphaned manual `Job` is deleted too (manual jobs exist only to back their application).

## Architecture

### Page (server component) — `src/app/(app)/applications/page.tsx`

Fetches the user's applications with their job (`include: { job: true }`, `orderBy: updatedAt desc`) as today, then renders the hero header + `<ApplicationsTable applications={apps} />`. The hero matches the consistent hero header pattern used across jobs/profile/resume.

### `ApplicationsTable` (client) — `src/components/applications-table.tsx`

Owner of view state. Responsibilities:
- Holds `search`, `filter` (All / Active / Saved), and `sort` state.
- Derives the displayed rows and the summary stats from props using pure helpers (below).
- Renders: **stat tiles** (Total tracked · Applied · Interviewing · Offers — counts only), **toolbar** (search input, filter chips, sort control, "Add job" button), and the **table**.
- Hosts the `AddJobDialog` and the `ApplicationDetailPanel`, opening them in response to row/toolbar interactions.
- Optimistic status changes reuse the existing `updateStatus` server action and the same "skip re-sync while a mutation is in flight" guard the board used.

### `ApplicationRow` (client) — part of or alongside the table component

One table row: company logo tile + company/role, an inline **StatusPill** menu, applied date (absolute + relative), salary, last-activity (relative `updatedAt`), and a kebab actions menu (Open posting, Edit, Delete). Clicking the row (outside interactive controls) opens the detail panel.

### `StatusPill` (client) — `src/components/status-pill.tsx`

A colored pill (dot + label) that acts as a Base UI menu trigger; selecting a status calls `updateStatus` optimistically. Color mapping: saved=neutral, applied=violet, interviewing=amber, offer=green, rejected=red. Reused by the row and the detail panel.

### `AddJobDialog` (client) — `src/components/add-job-dialog.tsx`

Base UI `Dialog` with the standard field set. On submit calls `createManualApplication`. Validates that Company and Role are non-empty; everything else optional. Applied date defaults to today when status is `applied` or later, empty otherwise.

### `ApplicationDetailPanel` (client) — `src/components/application-detail-panel.tsx`

Base UI `Dialog` (centered modal) showing one application's full detail and allowing edits to status, notes, salary, location, url, and applied date, plus a Delete action. Saves via `updateApplicationDetails` / `deleteApplication`.

### Pure logic — `src/lib/applications/table.ts` (new, unit-tested)

Framework-free so it can be tested without a DOM:
- `filterApplications(apps, { search, filter })` → filtered list. `Active` = status in {applied, interviewing, offer}; `Saved` = status saved; `All` = everything (rejected always included only under All).
- `sortApplications(apps, sortKey)` → sorted list. Keys: `lastActivity` (updatedAt desc, default), `applied` (appliedAt desc, nulls last), `company` (A→Z).
- `summarize(apps)` → `{ total, applied, interviewing, offers }` — plain factual counts only. No predicted/derived rates: a "response rate" would be statistically unreliable on small numbers and risks giving users false hope, so we deliberately omit it.

### Server actions — `src/lib/applications/actions.ts` (extend existing)

Keep `addApplication`, `updateStatus`, `updateNotes`. Add:
- `createManualApplication(input)` — transaction: create paste `Job` + `Application`; `revalidatePath("/applications")`. Input is validated server-side.
- `updateApplicationDetails(id, { salary, location, url, appliedAt, notes })` — updates the `Application` (notes, appliedAt) and its backing `Job` (salary, location, url) scoped to the user.
- `deleteApplication(id)` — deletes the application (and its orphaned paste job per the rule above); `revalidatePath`.

### Sidebar — `src/components/app-nav.tsx`

Reorder `navItems` to: Dashboard, **Applications**, Jobs, Resume, Profile.

### UI primitives to add — `src/components/ui/`

Add Base UI–backed `dialog` and a `menu`/`dropdown` primitive (matching the existing `tooltip.tsx` Base UI pattern and shadcn "base-nova" style) for the Add-job modal, detail modal, and status menu.

## Empty state

When the user has zero applications, the table area shows an `EmptyState` (existing component) with a short description of what this page is for and a primary **Add job** button, plus a secondary link to browse Jobs. Stat tiles render zeros.

## Data flow

```
page.tsx (server)
  └─ prisma.application.findMany({ include: { job } })
       └─ ApplicationsTable (client, holds search/filter/sort)
            ├─ summarize() ─────────► StatTiles (Total · Applied · Interviewing · Offers)
            ├─ filter+sort ─────────► table rows
            │     └─ ApplicationRow ─► StatusPill ─► updateStatus (optimistic)
            │                        └─ row click ─► ApplicationDetailPanel
            ├─ toolbar "Add job" ───► AddJobDialog ─► createManualApplication
            └─ detail panel ────────► updateApplicationDetails / deleteApplication
  (every mutation revalidatePath("/applications") → fresh props flow back down)
```

## Error handling

- Mutations use the optimistic-with-revert pattern already established in `application-kanban.tsx`: snapshot before, apply optimistically, revert + show a dismissible inline alert on failure.
- Server actions are user-scoped (`requireUser`, `where: { userId }`) exactly like the existing actions; `updateMany`/scoped queries prevent cross-user writes.
- `createManualApplication` rejects empty Company/Role with a returned error surfaced in the dialog.

## Testing

- **Unit (vitest):** `lib/applications/table.ts` — filter (each chip), sort (each key, null handling), summarize (counts across each stage, including empty list and all-rejected). Follows the existing `kanban.test.ts` / `format.test.ts` style.
- **Server actions:** extend `actions.test.ts` — `createManualApplication` creates job+application; `deleteApplication` removes orphan paste job but not shared/ats jobs; user scoping.
- **E2E (playwright):** add a job manually → it appears in the table; change status via pill; filter/sort; delete. Mirrors existing `e2e/` patterns.

## Out of scope / future

- Board view as a toggle (code retained).
- Compact density mode.
- CSV import/export, reminders, follow-up scheduling, bulk edit.
