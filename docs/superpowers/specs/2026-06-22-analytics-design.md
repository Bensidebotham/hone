# Analytics — Design

**Date:** 2026-06-22
**Status:** Approved (pending spec review)

## Goal

Add an `/analytics` page with two tabs that give the user a retrospective,
aggregate view the digest dashboard intentionally doesn't:

- **Personal** — how *their* job search is actually going (funnel, conversion,
  time-in-stage, momentum).
- **Market** — what *their sourced corpus* looks like (job volume over time,
  salary, in-demand tech, remote share).

The dashboard answers "what's new since I last looked." Analytics answers
"how is this going overall, and where should I aim."

## Foundation already in place (do not rebuild)

- **Charting:** `recharts` 3.8 is already a dependency and used by
  `src/components/dashboard/application-trend-chart.tsx`. Reuse it.
- **Funnel/status data:** `Application.status` (`saved` → `applied` →
  `interviewing` → `offer` → `rejected`) and timestamped `ApplicationEvent`
  rows (`type: status_change`, `fromStatus`/`toStatus`, `createdAt`).
- **Market corpus:** aggregator + ATS jobs ingest **globally** (`Job.userId`
  null) via `src/trigger/poll-jobs.ts`, enriched at ingest with `postedAt`,
  `salaryMin`/`salaryMax`, `techTags`, `isRemote`, `country`, `roleCategory`,
  `level`, `active`.
- **Lib pattern:** `src/lib/dashboard/*` — pure functions taking `userId`,
  returning typed aggregates, each with a colocated `*.test.ts`. Mirror this.
- **Auth:** `requireUser()` (`src/lib/auth.ts`), database sessions.

## Non-goals / explicit scope guards

- **Egress discipline (hard rule).** This app was paused for Neon egress
  overage; the recent fix stopped shipping job descriptions in the list feed.
  Analytics queries MUST return small aggregates only — use Prisma `groupBy`
  or raw SQL `COUNT`/`AVG`/bucketed `GROUP BY`. **Never** fetch row sets to the
  page and aggregate in JS, and never ship descriptions/raw rows to the client.
- **No new tables.** Compute on-demand (approach A below). No snapshot table,
  no Trigger cron for analytics.
- **No date-range picker / filters in v1.** Fixed sensible windows per chart.
- **"Market" is honestly labeled** as the user's sourced niche (configured
  new-grad/internship + ATS lists), not the whole job market.

## Architecture (Approach A: on-demand server aggregation)

```
src/app/(app)/analytics/page.tsx        server component, force-dynamic, requireUser
  └─ <AnalyticsTabs>                     client; tab state only (Personal | Market)
src/lib/analytics/
  ├─ personal.ts   getPersonalAnalytics(userId) -> PersonalAnalytics
  ├─ market.ts     getMarketAnalytics()         -> MarketAnalytics
  ├─ types.ts      shared result types
  └─ *.test.ts     colocated unit tests (seeded data)
src/components/analytics/
  ├─ funnel-chart.tsx
  ├─ conversion-stats.tsx
  ├─ time-in-stage.tsx
  ├─ activity-chart.tsx
  ├─ job-volume-chart.tsx
  ├─ salary-histogram.tsx
  ├─ tech-demand-chart.tsx
  └─ remote-split.tsx
```

The page calls both lib functions (Promise.all) and passes typed aggregates to
presentational components. Lib functions are the only DB touch-point and are
independently unit-testable. Components are pure/presentational (props in,
chart out) — no data fetching.

### Tab/navigation

Single `/analytics` route. Tab is client-side state (both datasets are cheap;
fetch both server-side once, toggle in the client) — no per-tab round-trip,
no URL param needed in v1. Add a nav link alongside the existing app nav.

## Personal tab — 4 pieces

| Piece | Source | Computation |
|---|---|---|
| **Funnel** | `Application` grouped by `status` | Counts at each stage applied → interviewing → offer; `rejected` shown as leakage. "Applied" = ever reached applied or beyond (status ∈ {applied, interviewing, offer, rejected}), so later stages still count as having applied. |
| **Conversion rates** | derived from funnel counts | applied→interview %, interview→offer %. Two headline numbers. |
| **Time-in-stage** | `ApplicationEvent` status_change rows | Median days applied→first response (first transition out of `applied`) and interview→decision (interviewing→offer/rejected). Median, not mean (robust to outliers). Show "n=" sample size; hide a stat when n is too small to be meaningful (n < 3 → "not enough data yet"). |
| **Activity over time** | `Application` (and/or applied events) by week | Applications per ISO week over the last ~12 weeks. Momentum bar/line. |

Empty state: if the user has zero applications, the whole tab shows a single
"Start tracking applications to see your funnel" prompt rather than empty charts.

## Market tab — 4 pieces

| Piece | Source | Computation |
|---|---|---|
| **Job volume over time** | global `Job` by `postedAt` (fallback `createdAt`) week-bucket | New postings per week, last ~12 weeks. `active`-agnostic (historical postings count). |
| **Salary distribution** | `Job.salaryMin`/`salaryMax` where present | Histogram of midpoint into fixed buckets. Footnote with "% of jobs that list salary" so the sample bias is visible. |
| **Top tech in demand** | `Job.techTags` (Gin-indexed array) | Frequency count, top ~12 tags. Raw SQL `unnest`/`GROUP BY` to aggregate in the DB, not in JS. |
| **Remote vs onsite** | `Job.isRemote` | Share split. Optionally segmented by `roleCategory` if it reads cleanly; otherwise a simple two-slice split. |

Window default: market charts consider `active` jobs for tech/remote/salary
(current market shape) and all jobs for volume-over-time (historical trend).

## Error / edge handling

- Each lib function is defensive: missing/zero data returns a well-typed empty
  result, never throws to the page.
- Components render an inline empty/low-data state per chart (see Personal n<3
  and Market salary-coverage notes).
- Page stays `force-dynamic`; no caching layer in v1.

## Testing

- Unit-test `personal.ts` and `market.ts` against seeded fixtures (mirror
  `src/lib/dashboard/*.test.ts`): funnel counts, conversion math, median
  time-in-stage including the n<3 guard, weekly bucketing boundaries, tech
  frequency, salary bucketing, remote split.
- Bucketing edge cases get explicit tests (week boundaries, null postedAt
  fallback, empty corpus).
- Light component render smoke test only where it adds value; charts are
  presentational.

## Out of scope (later, if wanted)

- Match-score-vs-conversion correlation, per-company/per-source breakdowns,
  email response-time analytics (`EmailInsight`), date-range filters, CSV
  export, snapshotting for cheaper reads.
