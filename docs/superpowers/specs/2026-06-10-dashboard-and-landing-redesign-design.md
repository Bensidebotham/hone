# Dashboard Refocus + Landing Page — Design

**Date:** 2026-06-10
**Status:** Awaiting review

## Goals

Two related pieces of work:

1. **Dashboard** — pivot away from "resume/profile health" and toward **application tracking**. Remove the health score card and health trend chart. Keep the cards the user likes (New Jobs, recent application activity) but shorten them with a **Show more** affordance. Make the pipeline funnel clickable. Add genuinely useful application-focused widgets (activity stats, an applications-over-time chart, an interviewing list, and a saved-not-applied queue). New Jobs is restricted to the **last 24 hours**.

2. **Landing page** — replace the near-empty `/` page with a full, **bold product-marketing** landing page that is on-brand (cream / violet / lime, Plus Jakarta Sans). Logged-in visitors are **redirected to `/dashboard`**.

Non-goals: no changes to the resume/LinkedIn/site analysis features themselves, the jobs feed, or the applications table internals (beyond adding a status filter). The health snapshot/trend libraries stay in place (still used by the profile area); the dashboard simply stops consuming them.

---

## Part 1 — Dashboard

### What's removed (from the dashboard only)

- `HealthCard` and `HealthTrendChart` imports/usage in `src/app/(app)/dashboard/page.tsx`.
- The `snapshotHealth()` call in the dashboard page (it recorded a daily health snapshot on every dashboard load; with health gone from this page it no longer belongs here).
- The component files `src/components/health-card.tsx` and `src/components/health-trend-chart.tsx` are deleted **only if** a repo-wide search shows they're unused elsewhere; otherwise left untouched.

The health libraries under `src/lib/health/` are **not** deleted — `summary.ts` is rewritten (it's really the dashboard summary, not health-specific), but `composite.ts`, `snapshot.ts`, and `health-trend.ts` remain for any other consumer.

### New data layer

Rename/relocate the dashboard summary out of the "health" framing. Move the summary to `src/lib/dashboard/summary.ts` (new folder) and add focused query helpers in `src/lib/dashboard/`:

- **`getActivityStats(userId)`** → `{ appliedThisWeek, appliedTotal, interviewing, responseRate }`
  - `appliedThisWeek`: count of `Application` where `appliedAt >= startOfWeek` (week starts Monday, local).
  - `appliedTotal`: count of `Application` where `appliedAt != null`.
  - `interviewing`: count of `Application` where `status = "interviewing"`.
  - `responseRate`: `(interviewing + offer) / appliedTotal`, rounded to a whole percent; `null` when `appliedTotal === 0` (rendered as "—").

- **`getApplicationTrend(userId)`** → `{ weekStart: string /* YYYY-MM-DD */, count: number }[]`
  - Applications submitted per week (by `appliedAt`) for the last **10 weeks**, oldest→newest, zero-filled for empty weeks so the line is continuous. This is the application-tracking analog of the old health trend chart that the user asked for.

- **`getInterviewing(userId, limit = 8)`** → `Application` rows (`include: { job: true }`) where `status = "interviewing"`, ordered `updatedAt desc`. Mapped to a light shape `{ id, jobTitle, company, updatedAt }`.

- **`getSavedNotApplied(userId, limit = 8)`** → `Application` rows where `status = "saved"`, ordered `updatedAt desc`, mapped to `{ id, jobTitle, company, url }`. (The funnel's "saved" bucket = roles saved into the tracker but not yet applied to.)

- **New Jobs window change** — `getNewJobsToday` becomes a rolling **last 24 hours** (`postedAt >= Date.now() - 24h`) and is renamed `getNewJobs24h` (kept in `src/lib/dashboard/`, importing from there). Fetch up to **25** rows so "Show more" has content; the card shows 4 collapsed.

- **`getRecentAppUpdates`** stays as-is (already a 24h window, limit 10). Card shows 4 collapsed.

- **Funnel** — unchanged query (grouped counts by status).

`getDashboardSummary(userId)` is rewritten to return:
```ts
{
  stats: { appliedThisWeek, appliedTotal, interviewing, responseRate },
  applicationTrend: { weekStart, count }[],
  funnel: Record<Status, number>,
  newJobs: JobRow[],          // last 24h, up to 25
  appUpdates: AppUpdate[],    // last 24h, up to 10
  interviewing: InterviewRow[],
  savedNotApplied: SavedRow[],
}
```
All queries run inside a single `Promise.all`.

### Show-more pattern

A small **`"use client"`** shared piece: `ShowMoreButton` (a styled ghost button reading "Show N more" / "Show less"). Each list card is converted to a client component that receives its full serializable `items` array, renders the first **4** by default, and toggles to the full set on click. Below the expandable list, a muted **"View all →"** `Link` deep-links to the relevant page (`/jobs`, `/applications`). Empty states keep the existing "No …" muted message.

Cards using this: New Jobs (24h), Recent Updates, Interviewing, Saved-not-applied.

### Clickable funnel

`FunnelCard` stage rows become `next/link` anchors to `/applications?status=<stage>`. The Applications page (`src/app/(app)/applications/page.tsx`) reads `searchParams.status`, validates it against the `AppStatus` set, and applies it to the Prisma `where` clause server-side (no change to `ApplicationsTable`). An invalid/absent `status` returns all applications as today. The active stage hover/focus uses the existing accent treatment.

### New cards

- **`ActivityStatsCard`** (or a row of stat tiles): 4 compact tiles — **Applied this week**, **Applied (all-time)**, **Interviewing**, **Response rate**. Each tile: small muted label + large `text-2xl font-extrabold` number; the lime `--highlight` accent is used sparingly (e.g. a tiny dot or the "this week" tile) so it stays special.
- **`ApplicationTrendChart`** — recharts area/line chart (reuses `src/components/ui/chart.tsx` + the look of the old trend chart), X = week, Y = applications submitted. Shows a friendly empty state when fewer than 2 weeks have data.
- **`InterviewingCard`** — expandable list of live interview processes (job title · company, relative "updated" time), "View all →" → `/applications?status=interviewing`.
- **`SavedQueueCard`** ("Saved, not applied") — expandable list, each row links out to the job `url` when present, "View all →" → `/applications?status=saved`.

### Layout

Header unchanged ("Welcome back, {name}" / "Your job search at a glance.").

```
[ Applied this week | Applied (all-time) | Interviewing | Response rate ]   ← 4 stat tiles (grid-cols-2 md:grid-cols-4)

grid gap-5 md:grid-cols-2 xl:grid-cols-3:
  [ Applications over time chart  (xl:col-span-2) ] [ Funnel (clickable) ]
  [ New Jobs (24h) ]  [ Recent Updates ]  [ Interviewing ]
  [ Saved, not applied (xl:col-span-2) ] ............ (flows naturally)
```

Exact spans finalized in implementation; the set of cards and their data contracts above are the spec. Existing card visual conventions (rounded-xl Card, `hover:shadow-sm`, muted secondary text, Badge for status) are preserved.

---

## Part 2 — Landing Page

A bold, on-brand marketing page at `/` (root, outside the `(app)` shell). Built from the existing design tokens and primitives; no external images required — the "app preview" is a faux-UI mock composed from divs/tokens.

### Auth behavior

At the top of `src/app/page.tsx` (Server Component): resolve the session via the existing auth helper; if a user is signed in, `redirect("/dashboard")`. Otherwise render the landing page. The sign-in CTAs submit the existing `signInWithGoogle` server action (which already redirects to `/dashboard` post-auth).

### Sections (top → bottom)

1. **Nav bar** — sticky, transparent→blur on scroll. "Hone" wordmark with the lime dot (matching `app-nav`), and a right-aligned **Sign in** button (`signInWithGoogle` form). Anchor links (Features, How it works, FAQ) on `md+`.
2. **Hero** — eyebrow label (text-primary, e.g. "Your job search, organized"), a large expressive headline **"Land your next role, sharper."** with the second line/word carrying a lime underline/highlight accent, a one-sentence subhead ("Track every application, catch fresh jobs daily, and hone your resume — all in one place."), and two CTAs: primary **"Get started →"** (sign in) + secondary **"See how it works"** (smooth-scroll anchor). Subtle violet radial/gradient glow behind the headline.
3. **App preview mock** — a stylized, static representation of the dashboard (faux nav + stat tiles + a mini funnel + a sparkline) built from real tokens, framed in a rounded card with a soft shadow and a slight tilt/float. Conveys the product without a screenshot dependency.
4. **Feature grid** — 3–4 cards, each lucide icon + title + one-line copy:
   - **Track every application** — a pipeline that beats a spreadsheet (saved → applied → interviewing → offer).
   - **Fresh jobs, every 24 hours** — new-grad/early-career roles surfaced daily.
   - **Hone your resume** — resume / LinkedIn / site analysis and job-match scoring.
   - **See your momentum** — activity stats and applications-over-time at a glance.
5. **How it works** — 3 numbered steps: **Sign in with Google → Save & track roles → Stay on top of every stage.**
6. **Stats band** — a few honest, non-fabricated headline figures (e.g. "5 pipeline stages", "Fresh jobs every 24h", "1 home for your whole search"). No invented user counts or testimonials.
7. **FAQ** — `ui/accordion` with 4–5 Q&As (Is it free? How do jobs get added? Is my data private? What roles are covered?).
8. **Closing CTA + footer** — a final centered "Get started" panel on a violet/lime treatment, then a slim footer with the wordmark and a copyright line.

### Implementation notes

- Components live in `src/components/landing/` (`landing-nav`, `hero`, `app-preview`, `feature-grid`, `how-it-works`, `stats-band`, `faq`, `landing-footer`); `page.tsx` composes them.
- Tasteful entrance animations via the already-installed `motion` package (fade/slide on scroll-in), gated behind `prefers-reduced-motion`. Keep it subtle.
- Fully responsive; reuses `Button`, `Card`, `Badge`, `Accordion` primitives and theme tokens. Light theme (cream) is the canvas.
- Metadata/`<title>` already set in root layout; refine the description if needed.

---

## Risks / Edge cases

- **Empty data** (new user): every card and the chart need clean empty states; stats show `0` / `—`.
- **`appliedAt` null** for `applied`-status rows created before this feature — trend/stats key off `appliedAt`, so such rows won't appear in "applied this week". Acceptable; `appliedTotal` likewise counts only rows with `appliedAt`.
- **Funnel status param** must be validated to avoid arbitrary `where` injection — whitelist against `AppStatus`.
- **Deleting health components** — only if unused elsewhere; verify with a grep first.
- **Landing redirect** must use the same session source the `(app)` layout uses, to avoid a flash of the landing page for logged-in users.

## Test / verification plan

- Unit tests for new dashboard query helpers (`getActivityStats`, `getApplicationTrend` zero-fill, `getSavedNotApplied`, `getNewJobs24h` window) against seeded data.
- The repo has seed scripts (`scripts/seed/`, `scripts/seed-applications.ts`) — use/extend them to eyeball the dashboard and landing locally.
- Manual: funnel stage click filters `/applications`; Show-more expands/collapses; 24h job window correct; landing redirects when logged in, renders when logged out, sign-in CTA works.
