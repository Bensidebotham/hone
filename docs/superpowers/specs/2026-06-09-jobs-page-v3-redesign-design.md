# Jobs Page v3 Redesign — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); pending implementation plan
**Scope:** The Jobs page of the Hone job-application suite (`job-application-suite`)

## Goal

Rework the Jobs page to feel like Indeed / LinkedIn: a real keyword search, a
two-pane browse-and-read layout, company logos, CS-centered filtering, and a
hard US-only filter on sourced listings. Remove the manual "Paste a Job"
feature. Keep all roles browsable but make CS roles easy to surface via facets.

## Decisions (locked during brainstorming)

- **Layout:** Two-pane, LinkedIn-style — job list on the left, full job detail
  rendered inline on the right. No more bouncing to an external URL to read.
- **Search:** Keyword (matches title OR company) + location.
- **US filter:** Show jobs identified as US **or** Remote. Drop foreign and
  unparseable-location jobs.
- **CS focus:** All roles remain browsable; CS is surfaced through facets
  (role category, level, tech stack) rather than a hard CS-only filter.
- **Company logos:** Resolved via a logo service keyed on a derived domain,
  with a colored monogram fallback.
- **Paste:** Removed entirely. The Applications tracker is unaffected (it uses
  the separate "Save to tracker" button, not paste).
- **Enrichment strategy:** Heuristic keyword-based enrichment at ingest
  (no LLM). Deterministic, zero token cost, exhaustively unit-testable.

## Architecture

### 1. Data model

New nullable columns on `Job` (populated by enrichment):

| Column         | Type       | Notes |
|----------------|------------|-------|
| `country`      | `String?`  | e.g. `"US"`. `null` when location cannot be confidently placed. |
| `isRemote`     | `Boolean`  | `@default(false)`. |
| `roleCategory` | `String?`  | one of: `frontend`, `backend`, `fullstack`, `mobile`, `ml-ai`, `data`, `devops`, `security`, `qa`, `other`. |
| `level`        | `String?`  | `intern`, `junior`, `mid`, `senior`, `staff`, `lead`, `manager`, or `null`. |
| `techTags`     | `String[]` | extracted stack, e.g. `["React","TypeScript","Go"]`. |
| `salaryMin`    | `Int?`     | annualized USD lower bound, parsed from salary text. `null` when not disclosed/parseable. |
| `salaryMax`    | `Int?`     | annualized USD upper bound. May equal `salaryMin` for single-value listings. |

The existing `salary String?` column is **kept** for display; `salaryMin` /
`salaryMax` are the numeric counterparts used only for filtering/sorting.

Indexes: `country`, `isRemote`, `roleCategory`, `level`, `salaryMin`; GIN index
on `techTags` for facet filtering.

The existing `source` column and `JobSource.paste` enum value are **kept** so
existing pasted rows stay valid. New jobs are all `ats`.

### 2. Enrichment module — `src/lib/jobs/enrich.ts`

Pure function `enrichJob(raw: NormalizedJob): JobEnrichment` composed of three
small, independently-testable classifiers:

- `parseLocation(location)` → `{ country, isRemote }`. Detects "Remote", US
  state codes/names, "United States"/"USA", and a curated US-cities list.
  Returns `country: null` for anything it cannot confidently place (these get
  dropped by the US filter unless also remote).
- `classifyRole(title)` → `{ roleCategory, level }` via ordered keyword rules.
  Exactly one primary `roleCategory` per job; falls back to `other`.
- `extractTechTags(title + descriptionText)` → matched against a curated tech
  dictionary.
- `parseSalaryRange(salary string + descriptionText)` → `{ salaryMin, salaryMax }`
  as annualized USD integers (extends the existing `parseSalary` helper, which
  today only returns a display string). `null` bounds when not disclosed.

Dictionaries (US cities, tech terms, role keywords) live in a separate
`src/lib/jobs/enrich.data.ts` constants file so they extend without touching
logic. The module is shared between live ingest and the backfill script.

### 3. Ingest — `src/trigger/poll-jobs.ts`

After each board is fetched/normalized, run `enrichJob()` and write the new
columns alongside the existing upsert. Enrichment is in-memory and pure, so it
adds negligible time to the poll.

### 4. Backfill — `scripts/backfill-enrichment.ts`

One-off, idempotent script that streams existing `Job` rows through the same
`enrichJob()` and updates the new columns. Run once after migration so existing
jobs gain country/facets and don't disappear from the US-filtered view.

### 5. Query / filter layer — `src/lib/jobs/filters.ts` (extended)

New params on top of existing `location` / `remote` / `postedWithin`:

- `q` — keyword, matches `title` OR `company` (case-insensitive contains).
- `roleCategory` — equality.
- `level` — equality.
- `techTags` — csv; job must contain the requested tag(s).
- `salaryMin` — desired minimum salary; a job matches when its `salaryMax`
  (or `salaryMin` when `salaryMax` is absent) is `>=` the requested value.
  Jobs with no parsed salary are excluded when this filter is active.

US hard filter baked into the base `where`:

```
{ source: "ats", OR: [{ country: "US" }, { isRemote: true }] }
```

Pagination: cursor-based on `(postedAt, id)`, ~25 rows per page (replaces the
current hard `take: 100`).

### 6. UI components

- `jobs/page.tsx` (server) — parse params, fetch page 1, render `<JobsBrowser>`.
- `JobSearchBar` — keyword + location inputs; submit writes to URL.
- `JobFilterChips` — live dropdown chips: Date, Remote, Role, Level, Tech,
  Salary; each updates the URL.
- `JobsBrowser` (client, two-pane):
  - **Left:** `JobListItem` rows — logo, title, company · location, salary,
    posted-ago, tag pills, bookmark star.
  - **Right:** `JobDetailPane` — logo, header, full description from
    `descriptionText`, and action buttons.
  - Selection is driven by `?selected=<jobId>` (back-button friendly,
    shareable); defaults to the first job in the list.
- `JobDetailPane` actions reuse existing `SaveJobButton` + `MatchButton`,
  relocated, plus a "View original ↗" link.
- `CompanyLogo` — resolves a logo by derived domain; colored monogram
  fallback on error. Logo host added to `next.config` image config.
- Pagination via "Load more" / infinite scroll on the list pane.
- **Mobile:** collapses to the list; tapping a job pushes the detail view.

### 7. Removals (paste)

- Delete the `PasteJobForm` import and the "Paste a Job" `<Card>` from
  `jobs/page.tsx`.
- Delete `src/components/paste-job-form.tsx`,
  `src/app/api/jobs/paste/route.ts`, and the route's test.
- Drop the ATS/Pasted `<Badge>` from the job UI (all jobs are ATS now).

## Error / edge cases

- No jobs match filters → empty state in the list pane.
- Nothing selected, or `selected` id not present in results → detail pane shows
  a "Select a job" placeholder.
- Logo fails to load → monogram fallback (never a broken image).
- Location unparseable and not remote → job is dropped by the US filter.

## Testing (Vitest + Playwright)

- **Unit — `enrich.test.ts`** (primary safety net): table-driven cases for
  `parseLocation` (US city, state code, "Remote", "London, UK" → null,
  ambiguous → null), `classifyRole`, `extractTechTags`, and `parseSalaryRange`
  (range, single value, "competitive"/none → null bounds).
- **Unit — `filters.test.ts`** (extended): `q`, `roleCategory`, `level`,
  `techTags`, `salaryMin`, and the US base filter.
- **E2E — Playwright:** search by keyword, apply a role chip, select a job,
  detail pane renders, bookmark toggles.

## Out of scope (v3 jobs page)

- LLM-based enrichment (possible future layer for hard-to-classify titles).
- Non-US job browsing.
- Reinstating manual paste.
- Changes to other pages (dashboard, tracker, resume) beyond the relocated
  Save/Match buttons already shared by the job card.
