# New-Grad Job Feed — Design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Author:** Ben + Claude

## Problem

The jobs feature stores **5,933 jobs** but the default feed shows **33**. It isn't a sourcing
problem at the fetch layer — it's that the relevance pipeline and default filters incinerate
99.4% of what's already in the database, and the feed is grouped by company rather than
presented as a browsable list.

Observed funnel (default view):

```
5,933  fetched & stored (source=ats)
2,154  → after roleCategory ∈ CS set      (−3,779 lost; "other" = 3,765 = 63% of all jobs)
1,133  → after US / ambiguous-remote      (−1,021 lost)
   33  → after level = "junior" (default) (−1,100 lost)  ← only 148/5,933 jobs are tagged "junior"
```

Additional findings:
- **15 of 40 configured companies return zero jobs** — fetchers return `[]` on any non-200,
  so dead/changed slugs vanish silently. Every Ashby company except Ramp is missing.
- **2,096 jobs have `level = null`** and can never appear in any level-filtered view.
- **1,126 jobs have `country = null`**; only the remote ones survive the base filter.

## Goal

Turn the jobs feature into a real, LinkedIn-style **flat job feed** that is genuinely useful to
**a new grad ~1 year out (graduating mid-2027)**: a long, scrollable, newest-first list of
individual roles, defaulting to **new-grad / entry-level full-time** positions, with a large and
relevant supply of jobs behind it.

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Feed shape | Flat chronological list, newest first (replaces company grouping) |
| Default audience | New-grad / entry-level **full-time** only; internships available via filter |
| Sourcing strategy | Expand ATS company roster **+** ingest open-source new-grad aggregator lists. No paid API. |
| Roster bias | Big-name companies + others known for competitive salary ranges |
| Visa sponsorship | Out of scope — no sponsorship field or filter |
| Company-grouped view | Retired entirely |
| Ingestion architecture | Unified — aggregator listings flow through the same `NormalizedJob` → enrich → `Job` table pipeline |

## Architecture

One `Job` table, one enrich pipeline, one flat feed query. A new fetcher produces the same
`NormalizedJob` shape from aggregator lists and upserts with `source = "aggregator"`. Everything
downstream (enrich, filters, feed) is source-agnostic.

```
                ┌── ATS fetchers (Greenhouse/Lever/Ashby, ~150 companies) ──┐
poll-jobs cron ─┤                                                            ├─→ enrichJob() ─→ upsert Job
                └── Aggregator fetcher (Simplify new-grad/internship lists) ─┘        │
                                                                                      ▼
                                                          flat feed query (filters.ts) → JobsBrowser (flat list)
```

## Components

### 1. Data model (`prisma/schema.prisma`)

- `JobSource` enum: add `aggregator` (existing: `ats`, `paste`).
- `Job.employmentType`: `"fulltime" | "internship" | null`.
- `Job.active`: `Boolean @default(true)` — aggregator lists mark stale roles closed; inactive
  rows are excluded from the feed.
- Migration via the project's Prisma/Neon workflow.

*Not added:* sponsorship (out of scope per decision).

### 2. Relevance rebuild (`src/lib/jobs/enrich.ts`, `enrich.data.ts`)

**Level classifier** — strengthen entry-level detection so the `level=null` bucket shrinks
dramatically. New-grad signals to recognize (case-insensitive, title-based):
`new grad`, `new graduate`, `university grad`, `early career`, `early-career`, `entry level`,
`entry-level`, `associate`, `graduate`, `campus`, `2026 grad`, `2027 grad`, plus the existing
numeric `Engineer/Developer/SWE I/II` rule. These map to the `junior` level bucket.

**Internship classifier** — `employmentType` derivation: title/keywords containing `intern`,
`internship`, `co-op`, `co op`, `summer 20xx` → `internship`; otherwise `fulltime`. Aggregator
metadata (which list a role came from) is authoritative when present.

**Role classifier** — add a generic `swe` category as a fallback: a title containing
`engineer` / `developer` / `software` that matches no specific category (frontend/backend/etc.)
classifies as `swe` instead of `other`. `swe` joins `CS_ROLE_CATEGORIES` so generic
"Software Engineer" titles stop being silently dropped. Genuine non-engineering titles (sales,
marketing, recruiting) still resolve to `other` and remain excluded.

### 3. Sourcing

**Fix dead slugs** — investigate and repair the ~15 silently-failing companies (Ashby cluster
first). Re-validate every slug against its provider API.

**Loud failures** (`src/trigger/poll-jobs.ts`) — log per-board fetched/upserted counts; emit a
warning when a board returns zero rows or a non-200, so a broken slug is visible, not silent.

**Expand roster** (`src/lib/jobs/boards.config.ts`) — grow from 40 → ~150 companies, biased to
big-name and competitive-comp employers across Greenhouse/Lever/Ashby.

**Aggregator fetcher** (`src/lib/jobs/aggregator.ts`, new) — fetch the machine-readable
`listings.json` from the Simplify new-grad and Summer-internship repos, normalize each entry
(company, title, locations, url, date_posted, active, intern-vs-newgrad) into `NormalizedJob`
+ `employmentType` + `active`, and upsert with `source = "aggregator"`. Runs inside the existing
`poll-jobs` cron.

**Dedup** (`src/lib/jobs/dedup.ts` or within upsert) — the same role can appear via both an ATS
board and an aggregator list. Dedup on normalized URL (strip query/trailing slash). When a
collision exists, prefer the direct ATS record; mark/skip the aggregator duplicate.

### 4. Filters (`src/lib/jobs/filters.ts`)

- **Default** (no params): `source ∈ {ats, aggregator}`, `active = true`,
  `roleCategory ∈ CS_ROLE_CATEGORIES` (now incl. `swe`), US-or-ambiguous-remote, and
  **entry-level full-time** — i.e. `level = junior` AND `employmentType = fulltime`.
- **Employment-type chip**: Full-time (default) | Internship | Both.
- Existing chips retained: role, tech, salary min, remote, location, posted-within, search.
- `level = "all"` still bypasses the level filter.
- Remove the company-grouping code path from the default feed.

### 5. Flat feed UI

- `src/app/(app)/jobs/page.tsx` + `src/components/jobs-browser.tsx`: default to a single flat,
  newest-first, infinite-scroll list (reuse existing cursor pagination; advance on scroll via
  IntersectionObserver, falling back to a "Load more" button). Split-pane detail on the right is
  kept.
- Retire `src/lib/jobs/grouped.ts` and `src/components/company-group.tsx` from the default path
  (remove once nothing references them).
- Add the employment-type chip to `src/components/job-filter-chips.tsx`; update level options to
  surface "Entry-level (default) / Internship / All".

### 6. Testing (TDD)

Unit tests first, then implementation, for:
- Level classifier (new-grad signals → `junior`; senior/manager unaffected).
- Employment-type classifier (intern/co-op/summer → `internship`).
- Role classifier (`swe` fallback; non-eng → `other`).
- Aggregator parser (listings.json → NormalizedJob, active handling).
- Dedup (URL normalization, ATS-preferred collisions).
- `buildJobWhere` defaults (entry-level FT) and employment-type chip.

## Implementation phasing

1. **Phase 1 — Data, relevance, sourcing.** Schema migration, classifier rebuild, dead-slug
   fixes + loud failures, roster expansion, aggregator fetcher + dedup. Re-run the funnel to
   confirm the default-feed count jumps from 33 into the hundreds/thousands.
2. **Phase 2 — Flat feed UI.** Flat infinite-scroll list, employment-type chip, retire grouped
   view.

Built in this order so the UI lands on good, plentiful data.

## Success criteria

- Default feed returns hundreds+ of relevant new-grad full-time roles (vs 33 today).
- `level = null` and `roleCategory = other` no longer silently drop large swaths of real
  engineering jobs.
- No company silently contributes zero jobs without a logged warning.
- Internships reachable in one filter click; not shown by default.
- Feed is a flat, scrollable, newest-first list; no company-grouped default remains.

## Compliance & rate-limiting (hard requirement)

The user's explicit condition: **no risk of being banned from any site; only public APIs and
open-source data.**

- **Only official public ATS APIs** (Greenhouse / Lever / Ashby) and **open-source GitHub lists**
  are used. No scraping of LinkedIn, Indeed, or any site whose ToS prohibits automated access.
  "LinkedIn-style" refers to the UX only.
- ATS endpoints are the providers' intended public job-board feeds; aggregator data is fetched as
  a public `listings.json` raw file.
- Polite-citizen practices: a real identifying `User-Agent`, conditional/cached requests
  (ETag / If-None-Match where supported), sane cadence (hourly is already very light), and
  honoring any rate-limit / `Retry-After` headers with backoff.
- Verify each aggregator repo's license and attribute as required.

## Out of scope

- Visa sponsorship filtering.
- Paid third-party jobs API.
- Changes to resume matching, applications tracker, or dashboard beyond what the feed requires.
