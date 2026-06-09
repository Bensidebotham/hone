# Jobs Feed Refinements — Design Spec

**Date:** 2026-06-09
**Status:** Approved (design); pending implementation plan
**Scope:** The Jobs page feed of the Hone app (`job-application-suite`), building on the v3 two-pane redesign + fixes batch.

## Goal

Make the jobs feed maximally useful for an entry-level CS-major job search right now, while keeping the architecture ready to scale to other levels/use cases later. Three changes:
1. Drop foreign remote jobs (EU/Asia/etc.).
2. Group the feed by company (collapse the flood of same-company roles).
3. Default the feed to entry-level CS roles (toggleable), with better entry-level classification.

## Decisions (locked during brainstorming)

- **Foreign remote:** detect foreign locations and drop them; keep US jobs and ambiguous "Remote" (no foreign signal). Surgical, not strict-US-only.
- **Grouping:** Layout **B** — each company shows as a block with its top 2 roles + a "Show N more" that expands the rest inline.
- **Entry-level:** the feed **defaults** to entry-level (new-grad / junior full-time; internships excluded), with a Level chip to switch to other levels or "All levels." Requires improving the classifier — only ~14 jobs are cleanly entry-tagged today.

## Architecture

### 1. Enrichment changes (`src/lib/jobs/enrich.ts`, `enrich.data.ts`)

**A. Foreign-location detection.** `parseLocation` returns a 3-way `country`: `"US"` (US signal) → else `"INTL"` (foreign signal) → else `null` (ambiguous). Add `FOREIGN_MARKERS` to `enrich.data.ts`: non-US country names + ISO-2 codes + major foreign cities + regions, e.g. United Kingdom/UK/England/London, Ireland/Dublin, Germany/Berlin/Munich, France/Paris, Netherlands/Amsterdam, Spain/Madrid/Barcelona, Poland, Sweden/Stockholm, Switzerland/Zurich, Canada/Toronto/Vancouver, India/Bangalore/Bengaluru/Hyderabad/Pune/Mumbai/Delhi/Gurgaon, Singapore, Japan/Tokyo, China/Beijing/Shanghai, Australia/Sydney/Melbourne, Brazil/São Paulo, Mexico, plus EMEA/APAC/LATAM/EU/Europe. Detection order in `parseLocation`: US markers/state/city first → if US, return `"US"`; else if any foreign marker → `"INTL"`; else `null`. `isRemote` logic unchanged. Note the existing 2-letter-state-code ambiguity (IN/DE) stays as-is; US detection runs first, so "Indiana"/"Delaware" via state lists still resolve US before INTL.

**B. Entry-level detection.** Expand `classifyRole`'s **junior** level rule to catch real entry-level titles. Keyword additions (substring, title-only): `new grad`, `new graduate`, `early career`, `early-career`, `university grad`, `university graduate`, `campus`, `associate`, `entry`. Plus a regex for roman/numeral level I/II: `/\b(engineer|developer|swe)\s+(i{1,2}|1|2)\b/i` → `junior`. Level rule precedence unchanged (intern first, then staff/lead/manager/senior, then junior); the regex check is evaluated within the junior branch. Internships remain `intern`.

**C. Re-backfill.** Re-run `scripts/backfill-enrichment.ts` (recomputes `country`/`isRemote`/`roleCategory`/`level`/`techTags`/salary from each job's stored `title`/`location`/etc.). No new DB columns: `country` simply gains the `"INTL"` value; more rows become `level="junior"`. Idempotent.

### 2. Feed query (`src/lib/jobs/filters.ts`)

**Foreign-remote filter.** Replace the base OR-branch. New base:
```ts
const base: Prisma.JobWhereInput = {
  source: "ats",
  roleCategory: { in: [...CS_ROLE_CATEGORIES] },
  OR: [
    { country: "US" },
    { AND: [{ isRemote: true }, { country: null }] },
  ],
};
```
Feed = US jobs **or** ambiguous-remote (remote + `country=null`). `INTL` jobs are excluded everywhere.

**Entry-level default.** Interpret the `level` param in `buildJobWhere`:
- `level` undefined (or empty) → push `{ level: "junior" }` (entry default)
- `level === "all"` → no level condition
- otherwise → push `{ level: params.level }`

This is centralized so the page query, `loadMoreJobs`, the grouped query, and `loadCompanyRoles` all inherit it. The **Saved view bypasses `buildJobWhere`** and is unaffected.

### 3. Company-grouped feed (layout B)

**Query module `src/lib/jobs/grouped.ts`** (reuses `buildJobWhere`; no raw SQL):
- `COMPANIES_PER_PAGE = 12`.
- `getCompanyFeedPage(params, page)`:
  1. `prisma.job.groupBy({ by: ["company"], where, _count: { _all: true }, _max: { postedAt: true, salaryMax: true }, orderBy, take: COMPANIES_PER_PAGE, skip: page * COMPANIES_PER_PAGE })` where `orderBy` follows the sort: Newest → `{ _max: { postedAt: "desc" } }`; Salary → `{ _max: { salaryMax: "desc" } }`.
  2. For the returned companies, fetch top-2 roles each in parallel: `Promise.all(companies.map(c => prisma.job.findMany({ where: { AND: [where, { company: c.company }] }, orderBy: jobOrderBy(params.sort), take: 2, select: <JobListRow fields> })))`.
  3. Return `{ groups: Array<{ company: string; totalCount: number; topRoles: JobListRow[] }>, hasMore: boolean }` (`hasMore` = more companies exist beyond this page).
- Server action `loadCompanyRoles(company, params)` in `actions.ts`: `findMany({ where: { AND: [buildJobWhere(params), { company }] }, orderBy: jobOrderBy(params.sort), skip: 2, take: 50, select: <JobListRow fields> })` → the rest of one company's roles for "Show N more."

**UI components:**
- New `src/components/company-group.tsx` (client): company logo + name + "{totalCount} roles"; renders top-2 `JobListItem`s; a "Show {totalCount-2} more" button that calls `loadCompanyRoles` once, appends the rest, and hides itself. Local `useState` for expanded roles + loading.
- `src/components/jobs-browser.tsx`: in the normal (non-saved) feed, the left pane renders a list of `<CompanyGroup>` instead of flat `JobListItem`s, plus a "Load more companies" button backed by an explicit `loadMoreCompanies(params, page)` server action (a thin wrapper over `getCompanyFeedPage` returning the next page's `groups` + `hasMore`). The Saved view path stays the flat `JobListItem` list. **Default selection** in grouped mode = the first top-role of the first company (so the detail pane is populated on load), unless `?selected=` overrides it.
- `src/app/(app)/jobs/page.tsx`: for the normal feed, call `getCompanyFeedPage(params, 0)` and pass `groups` + `hasMore` to `JobsBrowser`. The detail pane still needs the selected job; selection by `?selected=` resolves against whichever roles are currently loaded (top-2 + any expanded). If `selected` isn't among loaded roles, the detail pane fetches it (small `findById` server action) OR falls back to the "Select a job" placeholder. **Decision:** add a lightweight `getJobDetail(id)` server action so a deep-linked `?selected=` always resolves.
- The **Level chip** (`job-filter-chips.tsx`) options become: `["", "Entry-level"]`, `["all", "All levels"]`, `["intern", "Internships"]`, `["mid", "Mid"]`, `["senior", "Senior"]`, `["staff", "Staff"]`, `["lead", "Lead"]`, `["manager", "Manager"]`. Default (no param) shows "Entry-level" selected.

**Sort interaction:** the Sort chip orders both companies (by `_max`) and roles within a company (`jobOrderBy`).

**Pagination model:** the feed paginates by **company** (12/page). Within a company, top-2 are shown and the rest load on expand (capped at 50; deeper is out of scope).

## Error / edge cases
- Company with ≤2 roles → no "Show more."
- `loadCompanyRoles` returns [] → button just disappears.
- Deep-linked `?selected=` not in loaded roles → `getJobDetail(id)` resolves it; if not found/auth-mismatch → "Select a job" placeholder.
- Empty feed (e.g., entry-level filter too narrow) → existing empty state, with copy nudging "Try 'All levels'."
- Saved view unchanged (flat list, bypasses all of the above).

## Testing (Vitest + Playwright)
- **Unit — `enrich.test.ts`:** `parseLocation` returns `"INTL"` for foreign ("London, UK", "Bangalore, India", "Remote - EMEA"), `"US"` for US, `null` for bare "Remote"/ambiguous. `classifyRole` tags `junior` for "New Grad SWE", "Software Engineer I", "Associate Software Engineer", "Early Career Engineer"; still `intern` for interns; `senior`/`staff` unaffected.
- **Unit — `filters.test.ts`:** base excludes `INTL` (foreign remote dropped); ambiguous remote kept; default adds `level:"junior"`; `level=all` adds no level condition; `level=senior` filters senior.
- **Unit — `grouped.test.ts`:** `getCompanyFeedPage` groups by company, caps top roles at 2, reports `totalCount`, orders companies by sort; `hasMore` correct at page boundary. (Mock prisma.)
- **E2E — Playwright:** mirror existing convention (unauth redirect runs; grouped/expand flow added commented per repo pattern).

## Out of scope
- Mid/senior/business/other-persona feeds (future scaling — the architecture supports them via the Level chip + role categories).
- Internships as a default (reachable via the Level chip).
- Raw-SQL window-function optimization for top-N-per-company (the bounded parallel findMany is sufficient at this scale).
- Re-running prod ingest / Trigger redeploy (separate deploy task).
