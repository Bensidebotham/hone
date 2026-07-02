# Remove job search — decouple the tracker from `Job`

**Date:** 2026-07-02
**Status:** Approved (design)
**Sub-project 1 of 4** in the Hone pivot. Sequence: (1) remove job search + decouple → (2) spreadsheet tracker → (3) resume-per-job tailoring → (4) Chrome extension.

## Why

Hone's ingestion layer (hourly `poll-jobs`, the `Job`/`Match`/`UserSavedJob` tables, the `/jobs` feed, the Market analytics tab) is the commoditized part of the product and the source of the Neon storage/egress cost that stalled the project. The differentiated core is **email-driven application tracking** (the Gmail pipeline + the `ApplicationEvent` log). This project prunes Hone down to that core.

The key structural fact: `Application.jobId` is currently a **required FK to `Job`**, so every tracked application is built on top of an ingested job row. Removing job search is therefore not a UI deletion — it is a **data-model decoupling**: the application must become a standalone record that carries its own job info.

## Goals

- Remove the entire job-ingestion feature and every module that only exists to serve it.
- Make `Application` a standalone record (flat fields, no `Job` FK).
- Preserve the email-driven tracker: Gmail sync, suggestions, the events log, personal analytics, the dashboard digest.
- Leave the manual-add and email-suggestion create paths working, with a `description` field in place to feed resume tailoring (sub-project 3).
- Keep `npm test` and `next build` green.

## Non-goals

- The spreadsheet tracker redesign (sub-project 2) — the kanban/table stay as-is here, just reading standalone applications.
- Resume tailoring, the Chrome extension.
- Any new dashboard widget (e.g. "Needs attention") — deferred to sub-project 2.

## Design

### 1. Data model

`Application` becomes standalone. Remove `jobId` + the `job` relation; add flat fields:

```prisma
model Application {
  id          String    @id @default(cuid())
  userId      String
  company     String     // was job.company
  title       String     // was job.title
  url         String?
  location    String?
  salary      String?    // free-text, as today
  description String?    // job posting text — feeds resume tailoring (sub-project 3)
  status      AppStatus  @default(saved)
  notes       String?
  appliedAt   DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  user        User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  events        ApplicationEvent[]
  emailInsights EmailInsight[]
}
```

**Deleted:** models `Job`, `Match`, `UserSavedJob`; enum `JobSource`; the `Resume.matches` relation.

**Migration strategy — clean reset:** drop `Job`/`Match`/`UserSavedJob`, recreate `Application` with the flat columns, re-seed the demo via `seed-demo.ts`. No backfill of existing rows (existing data is seed/demo, treated as disposable).

### 2. Deletions

- **Routes:** `src/app/(app)/jobs/page.tsx`; `src/app/api/match/route.ts`.
- **Trigger:** `src/trigger/poll-jobs.ts`. Keep `sync-gmail`, `analyze-resume`, `analyze-site`, `analyze-linkedin`, `example`.
- **`src/lib/jobs/`:** the whole ingestion layer — `aggregator`, `fetchers`, `enrich`, `enrich.data`, `boards.config`, `constants`, `description`, `filters`, `salary`, `url`, `saved`, `saved-queries` (+ their tests).
- **`src/lib/dashboard/new-jobs.ts`**, **`src/lib/health/new-jobs.ts`**, **`src/lib/analytics/market.ts`** (+ tests).
- **Components:** `jobs-browser`, `job-card`, `job-list-item`, `job-detail-pane`, `job-filter-chips`, `job-scope-tabs`, `job-search-bar`, `new-jobs-card`, `new-jobs-rail`, `job-browser-types`, and the market-tab analytics components (+ their tests).
- **Scripts:** `run-poll.ts`, `backfill-descriptions.ts`, `backfill-enrichment.ts`; `funnel.ts` and any seed scripts only if job-bound (verify each during implementation). Remove the `poll` script from `package.json` if it no longer resolves.
- **`src/lib/match/`** (`score.ts`, `skills.ts`) — only used by the deleted `/api/match` route and `Match` model; verify no other consumer, then delete.

### 3. Create / edit paths

The awkward "paste-source `Job` vs. immutable ATS `Job`" split in `src/lib/applications/actions.ts` disappears:

- `addApplication(jobId)` — **deleted** (no feed to apply from).
- `createManualApplication(input)` — **simplified**: creates one `Application` with flat fields; no backing `Job`. Input gains an optional `description`. Still records a `created` event.
- `updateApplicationDetails(...)` — **simplified**: drops the `job.source === "paste"` branching; company/title/url/location/salary/description all live on `Application` and are always editable.
- `deleteApplication(...)` — **simplified**: no orphaned-job cleanup.
- **Email-driven create (kept):** the Gmail pipeline's existing `suggest_new` decision (email matches no application) surfaces a suggestion that, on accept, creates a standalone `Application` from the classified `company`/`title`. During implementation, confirm `src/lib/gmail/apply.ts` + `suggestions.ts` actually wire accept → create; if they only render a suggestion, add the create action.

After this project, applications are created via **manual add** or **accepted email suggestion**. (The extension create path is sub-project 4.)

### 4. Manual-add form

Add an optional **Job description** textarea to the existing add-application form (alongside company/title/url/salary/location/notes). Optional; stored in `Application.description`. This is the hook resume tailoring (sub-project 3) reads.

### 5. Dashboard / analytics / nav / landing

- **Dashboard:** remove `NewJobsRail` from the page and `getNewJobsForUser` from `getDashboardSummary`. Reflow: right column becomes the Interviewing card (main column may go full-width if it reads better). Activity stats, Gmail suggested updates, updates feed, and application trend are untouched.
- **Analytics:** delete the **Market** tab and `market.ts`. Only **Personal** analytics remains, so collapse the tab switcher (`analytics-tabs.tsx`) and render personal analytics directly. Personal analytics reads `ApplicationEvent` and is unaffected.
- **Nav:** remove the **Jobs** link from `app-nav.tsx`; keep Analytics.
- **Landing:** rewrite `feature-showcase.tsx` copy to lead with email-driven tracking (drop the live job-feed pitch). Update `README.md` — remove the job-feed feature bullet, drop the `poll-jobs` box from the architecture diagram, drop the job-ingestion parts of the tech table.

### 6. Testing

- Delete tests for removed modules.
- Update `summary.test.ts` (no `newJobs`), the applications action tests (flat fields, no `Job`), and the demo seed.
- Add coverage for the simplified `createManualApplication` and `updateApplicationDetails` (flat fields; `description` round-trips).
- Verify `npm test` and `next build` are green before completion.

## Risks / things to verify during implementation

- **Hidden `Job` consumers:** grep for `prisma.job`, `prisma.match`, `prisma.userSavedJob`, and `JobSource` after the model changes to catch any reference not listed above.
- **`match/` reuse:** confirm nothing outside the deleted `/api/match` route imports `lib/match/*` before deleting.
- **Gmail `suggest_new` wiring:** confirm the accept path creates an application; this is the only non-manual create path that survives.
- **e2e specs:** the Playwright suite has a jobs-page spec — delete/adjust it so `npm run e2e` still passes.
