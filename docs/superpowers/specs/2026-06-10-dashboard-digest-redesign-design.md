# Dashboard Digest Redesign — Design

**Date:** 2026-06-10
**Status:** Approved, ready for implementation planning

## Problem

The current dashboard is a 7-widget control center (`ActivityStatsCard`, `ApplicationTrendChart`, `FunnelCard`, `NewJobsCard`, `AppUpdatesCard`, `InterviewingCard`, `SavedQueueCard`). It tries to show *everything* about *all* applications at once — too much going on. The user wants the dashboard to answer one question instead: **"What's new in my job search since I last looked?"**

This also sets up the roadmap: a future Gmail integration will read emails and auto-update applications. The dashboard should be the place those auto-detected updates surface.

## Concept

Turn the dashboard into a **daily digest** built around two feeds plus a context graph:

- **Updates** (primary) — what changed on the applications I'm tracking.
- **New Jobs** (right rail) — newly-posted roles matching my search that I haven't acted on.
- **Trend graph** (secondary strip) — the existing applications-over-time chart, kept but de-emphasized.

Everything else (funnel, interviewing list, saved queue, stat tiles) leaves the dashboard. None of it is lost — that data already lives on the Applications page (`/applications`, a filterable table) and the Jobs page.

## Layout (Option B)

Updates lead as the primary left column; New Jobs sit in a narrower right rail; the trend graph is a secondary strip under the Updates column.

```
┌─────────────────────────────────────────────────────────┐
│  Good morning, Ben — here's what's new since yesterday   │
├──────────────────────────────────┬──────────────────────┤
│  🔔 UPDATES (primary, ~1.7fr)    │  🆕 NEW JOBS (~1fr)  │
│  • Acme → moved to Interviewing  │  • Senior FE · Linear│
│  • Globex → Offer                │  • Eng · Vercel      │
│                                  │  • Eng · Stripe      │
│  ┌────────────────────────────┐  │  • Backend · Ramp    │
│  │ 📈 trend strip (secondary) │  │                      │
│  └────────────────────────────┘  │  [ View all jobs → ] │
└──────────────────────────────────┴──────────────────────┘
```

**Fallback:** If Layout B feels cramped once built, fall back to **Layout A** — Updates and New Jobs as equal side-by-side columns with the graph as a full-width strip underneath. (Saved as a known alternative, not the default.)

Responsive: on narrow/mobile the two columns stack (Updates first, then New Jobs, then graph).

## The "what's new" window

A digest needs a well-defined notion of "new." Today both cards use a fixed rolling 24h, which drops anything older if the user skips a day.

**Rule:** window start = **min(now − 24h, lastDashboardVisitAt)**.
- Always shows at least the last 24 hours.
- If the user hasn't visited in longer, the window stretches back to their last visit so nothing is missed.

**Implementation:**
- Add `lastDashboardVisitAt DateTime?` to the `User` model.
- On each dashboard load, compute the window from the *current* stored value, then update `lastDashboardVisitAt` to now (after reading, so the current load still shows everything since the prior visit).
- Items newer than the prior `lastDashboardVisitAt` get a subtle "new" marker in the UI. First-ever visit (null) falls back to the 24h window.

## Feed 1 — New Jobs (right rail)

**Source:** the same curated pool the Jobs page already uses. Reuse `buildJobWhere` from `src/lib/jobs/filters.ts` (CS roles, US/remote, junior + fulltime defaults, `active`, `source` in ats/aggregator) instead of the current `getNewJobs24h`'s ad-hoc `{ source: "ats" }`.

**Filters on top of the pool:**
- `postedAt >= windowStart` (the digest window above).
- **Exclude jobs already in the user's pipeline** — any job with an `Application` for this user (saved/applied/interviewing/offer/rejected) is hidden.
- Order by `postedAt desc`, cap at a small number (e.g. 5 visible, expandable or "View all jobs →" link to `/jobs`).

**Item:** title, company, location; links to the job (external `url` when present, mirroring today's `NewJobsCard`).

**Empty state:** friendly "You're caught up — no new matches in your search." (Not an error or blank box.)

**Note:** Real user-defined preferences (desired roles, locations, remote, salary, tech) do **not** exist yet and are explicitly **out of scope** here. "Match my criteria" means "the curated Jobs-page pool, minus my pipeline." A proper `UserJobPreferences` system is a separate future project.

## Feed 2 — Updates (primary column)

This is the feed the future Gmail integration will populate. To make it accurate now *and* future-proof, introduce a lightweight event log instead of deriving from `Application.updatedAt` (which is noisy — editing a note bumps it — and can't say *what* changed).

### New model: `ApplicationEvent`

```prisma
model ApplicationEvent {
  id            String      @id @default(cuid())
  applicationId String
  userId        String
  type          AppEventType
  fromStatus    AppStatus?
  toStatus      AppStatus?
  summary       String?      // human-readable, e.g. "Moved to Interviewing"
  createdAt     DateTime     @default(now())

  application   Application  @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}

enum AppEventType {
  status_change
  created
  // future: email_detected (written by Gmail integration)
}
```

(Add the back-relations on `Application` and `User`.)

### Writing events

Status transitions are centralized in `src/lib/applications/actions.ts`. Write an `ApplicationEvent` at each transition point:
- `addApplication` / `createManualApplication` → `created` event.
- `updateStatus` / `markAppliedToday` → `status_change` event with `fromStatus`/`toStatus` (read current status before updating to capture `fromStatus`; skip if status is unchanged).

Note edits (`updateNotes`, `updateApplicationDetails`) do **not** create events — that's the noise we're removing.

### Reading the feed

`getRecentAppUpdates` (in `src/lib/health/app-updates.ts`) is replaced/rewritten to read `ApplicationEvent` rows for the user where `createdAt >= windowStart`, newest first, joined to the application + job for display. Each item shows the job title, company, a status badge for `toStatus`, the `summary`, and relative time; the "new since last visit" marker applies per the window rule. Item links to the application on `/applications`.

**Empty state:** "No updates since your last visit." Mention that updates will populate automatically once Gmail is connected (light forward-reference, optional).

**Backfill:** not required. The feed simply starts empty and fills as new transitions happen. (Optional, non-blocking: a one-time seed of `created` events for existing applications — decide during planning; default is no backfill.)

## Feed 3 — Trend graph (secondary strip)

Keep `ApplicationTrendChart` and its data (`getApplicationTrend`) unchanged. Restyle to a shorter, lower-emphasis strip tucked under the Updates column. No logic changes.

## Header

Replace "Welcome back, {name} / Your job search at a glance" with a digest framing, e.g. **"Good morning, {name}"** + subline **"Here's what's new since you last checked."** (Time-of-day greeting is optional polish; the key change is the "what's new" framing.)

## Removed from the dashboard

Removed from the dashboard composition (`src/app/(app)/dashboard/page.tsx`): `ActivityStatsCard`, `FunnelCard`, `InterviewingCard`, `SavedQueueCard`. The components and their data-loaders stay in the codebase (no deletions) — they're simply no longer composed onto the dashboard. All of this data remains reachable via the Applications page (`/applications`, filterable by status) and the Jobs page.

`getDashboardSummary` (`src/lib/dashboard/summary.ts`) is slimmed to load only what the new dashboard needs: the digest window, new jobs (filtered), update events, and the application trend. It stops loading stats, funnel groupBy, interviewing, and saved-not-applied.

## Components / units

- `src/app/(app)/dashboard/page.tsx` — recomposed: header + two-column grid (Updates + New Jobs rail) + trend strip; stamps `lastDashboardVisitAt`.
- `src/lib/dashboard/digest-window.ts` *(new)* — computes window start from `lastDashboardVisitAt`; returns `{ windowStart, previousVisitAt }`.
- `src/lib/dashboard/new-jobs.ts` — rewritten to take `userId` + window, reuse `buildJobWhere`, exclude pipeline jobs.
- `src/lib/health/app-updates.ts` — rewritten to read `ApplicationEvent`.
- `src/lib/applications/actions.ts` — emit events at transition points.
- `src/lib/dashboard/summary.ts` — slimmed loader.
- `src/components/dashboard/updates-feed.tsx` *(new or renamed from app-updates-card)* — primary Updates column.
- `src/components/dashboard/new-jobs-rail.tsx` *(new or adapted from new-jobs-card)* — right rail.
- `prisma/schema.prisma` — `ApplicationEvent` model, `AppEventType` enum, `User.lastDashboardVisitAt`, back-relations; migration.

## Data flow

1. Dashboard loads → read `user.lastDashboardVisitAt` → compute `windowStart` → fire queries (new jobs filtered by pool+window+pipeline-exclusion; update events in window; trend) in parallel → render → stamp `lastDashboardVisitAt = now`.
2. User changes an application's status anywhere → `actions.ts` writes an `ApplicationEvent` → next dashboard load surfaces it in Updates.
3. (Future) Gmail integration writes `email_detected` events into the same table → they appear in Updates with no dashboard changes.

## Error handling & edge cases

- **First visit** (`lastDashboardVisitAt` null): use 24h window; no "new" markers beyond that.
- **Empty feeds:** explicit friendly empty states, never blank boxes.
- **Unchanged status update:** no event written (guard in `updateStatus`).
- **Deleted application:** `onDelete: Cascade` removes its events.
- **Stamping order:** read window from the old value first, render, then update — so the current load isn't excluded by its own visit stamp.

## Testing

- `digest-window` logic: null → 24h; recent visit (<24h ago) → 24h; old visit (>24h ago) → stretches to visit time.
- New-jobs query: excludes pipeline jobs; respects the curated pool; respects window.
- Event emission: `updateStatus` writes a `status_change` with correct from/to; unchanged status writes nothing; note edits write nothing; `addApplication` writes `created`.
- Updates feed reads events within window, newest first.
- Dashboard renders with empty data (fresh user) without errors.

## Out of scope

- User-defined job preferences / `UserJobPreferences` model (future project).
- The actual Gmail integration (this only lays the `ApplicationEvent` spine it will use).
- Changes to the Applications or Jobs pages beyond reusing `buildJobWhere`.
- Deleting the now-unused dashboard widget components.
