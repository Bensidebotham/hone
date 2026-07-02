# Remove Job Search — Decouple the Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Hone's job-ingestion feature and make `Application` a standalone record that carries its own job info, leaving the email-driven tracker intact.

**Architecture:** Flatten the `Job` fields onto `Application` (drop `Job`/`Match`/`UserSavedJob`), then update every query and read site from `app.job.X` to `app.X`. Delete the ingestion layer (`/jobs`, `poll-jobs`, `lib/jobs`, `lib/match`, market analytics) and simplify the create/edit actions that previously juggled paste-vs-ATS jobs.

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), Prisma 7 + Neon Postgres, Vitest + Testing Library, Playwright.

## Global Constraints

- This is a NON-standard Next.js build — before writing App Router code, consult `node_modules/next/dist/docs/` (per `AGENTS.md`). Heed deprecation notices.
- Migration is a **clean reset** — no backfill of existing rows; re-seed the demo afterward.
- `AppStatus` enum is unchanged (`saved | applied | interviewing | offer | rejected`); `saved` now means "tracking, not yet applied."
- Keep `salary` as free-text on `Application` (no numeric enrichment columns).
- Commit after every task. Use author identity `Ben Sidebotham <bensidebotham89@gmail.com>` (git config is not set globally — pass `-c user.name=... -c user.email=...` on each commit, or set it once locally in Task 0).
- Definition of green: `npx tsc --noEmit`, `npm test`, and `next build` all pass. `npm run e2e` passes at the final task.

**Note on intermediate builds:** Task 1 changes the schema and will leave `tsc`/`build` red until Task 6 finishes the read-site refactor. That is expected. Tasks 1–6 form one coherent refactor; the first full-green gate is the end of Task 6. Commit at each task anyway (frequent commits), but only claim "build green" where a step explicitly runs it.

---

### Task 0: Set local git identity (one-time)

**Files:** none

- [ ] **Step 1: Configure identity for this repo**

```bash
git config user.name "Ben Sidebotham"
git config user.email "bensidebotham89@gmail.com"
```

(If you prefer not to persist it, skip this and prepend `-c user.name="Ben Sidebotham" -c user.email="bensidebotham89@gmail.com"` to every `git commit` below.)

---

### Task 1: Flatten the Prisma schema + migrate

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_flatten_application_drop_jobs/migration.sql` (generated)

**Interfaces:**
- Produces: `Application` model with flat fields `company: String`, `title: String`, `url: String?`, `location: String?`, `salary: String?`, `description: String?`; no `jobId`/`job`. Models `Job`, `Match`, `UserSavedJob` and enum `JobSource` no longer exist.

- [ ] **Step 1: Edit the `Application` model**

Replace the current `Application` model body with:

```prisma
model Application {
  id          String    @id @default(cuid())
  userId      String
  company     String
  title       String
  url         String?
  location    String?
  salary      String?
  description String?
  status      AppStatus @default(saved)
  notes       String?
  appliedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  user          User               @relation(fields: [userId], references: [id], onDelete: Cascade)
  events        ApplicationEvent[]
  emailInsights EmailInsight[]
}
```

- [ ] **Step 2: Delete the ingestion models + enum**

Remove the entire `model Job { ... }`, `model Match { ... }`, `model UserSavedJob { ... }` blocks and the `enum JobSource { ... }` block from `prisma/schema.prisma`.

- [ ] **Step 3: Remove dangling relations on `User` and `Resume`**

In `model User`, delete these two lines:

```prisma
  jobs                 Job[]
  savedJobs            UserSavedJob[]
```

In `model Resume`, delete this line:

```prisma
  matches     Match[]
```

- [ ] **Step 4: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Create and apply the migration (clean reset)**

Run: `npx prisma migrate dev --name flatten_application_drop_jobs`
Expected: Prisma warns that dropping `Job`/`Match`/`UserSavedJob` will lose data — accept. Migration applies; `Prisma Client` regenerates. If the dev DB has data you don't care about and Prisma asks to reset, allow it.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): flatten job fields onto Application, drop Job/Match/UserSavedJob"
```

---

### Task 2: Relocate the salary parser into applications

The salary sort on the table used `job.salaryMin` (a deleted enrichment column). Preserve numeric salary sorting by parsing the free-text `salary` string. Move the parser out of the doomed `lib/jobs` folder.

**Files:**
- Create: `src/lib/applications/salary.ts`
- Create: `src/lib/applications/salary.test.ts`
- (Deletion of the old `src/lib/jobs/salary.ts` happens in Task 8.)

**Interfaces:**
- Produces: `parseSalaryRange(text: string | null | undefined): { salaryMin: number | null; salaryMax: number | null }`

- [ ] **Step 1: Copy the parser**

Copy the full current contents of `src/lib/jobs/salary.ts` into `src/lib/applications/salary.ts` **unchanged** (it has no imports, so it moves cleanly).

- [ ] **Step 2: Copy the test, retargeting the import**

Copy `src/lib/jobs/salary.test.ts` to `src/lib/applications/salary.test.ts` and change its import path from `./salary` / `@/lib/jobs/salary` to `@/lib/applications/salary`.

- [ ] **Step 3: Run the moved test**

Run: `npx vitest run src/lib/applications/salary.test.ts`
Expected: PASS (same assertions as before).

- [ ] **Step 4: Commit**

```bash
git add src/lib/applications/salary.ts src/lib/applications/salary.test.ts
git commit -m "refactor(applications): relocate salary parser out of lib/jobs"
```

---

### Task 3: Rewrite the application create/edit/delete actions

**Files:**
- Modify: `src/lib/applications/actions.ts`
- Modify: `src/lib/applications/actions.test.ts`

**Interfaces:**
- Consumes: `recordApplicationEvent` (`@/lib/applications/events`), `prisma` (`@/lib/db`).
- Produces:
  - `createManualApplication(input: ManualApplicationInput): Promise<void>`
  - `updateApplicationDetails(applicationId: string, input: ApplicationDetailInput): Promise<void>`
  - `deleteApplication(applicationId: string): Promise<void>`
  - `ManualApplicationInput` now includes optional `description?: string`.
  - `ApplicationDetailInput` now includes optional `description?: string`.
  - `addApplication(jobId)` is **removed**.

- [ ] **Step 1: Update the failing tests first**

In `src/lib/applications/actions.test.ts`, remove any test for `addApplication`, and rewrite the `createManualApplication` / `updateApplicationDetails` / `deleteApplication` tests so they no longer reference `prisma.job` or `app.job.source`. Concretely:
- `createManualApplication`: assert `prisma.application.create` is called with flat fields (`company`, `title`, `status`, `url`, `location`, `salary`, `description`, `appliedAt`) and that **no** `prisma.job.create` occurs.
- `updateApplicationDetails`: mock `prisma.application.findFirst` to return `{ id: "app1", userId: "u1" }` (no `job`), assert `prisma.application.update` writes the provided flat fields; assert no `prisma.job.update`.
- `deleteApplication`: assert `prisma.application.delete` is called; assert no `prisma.job` cleanup.

Example replacement for the create test:

```ts
it("creates a standalone application with flat fields", async () => {
  appCreate.mockResolvedValue({ id: "app1" });
  await createManualApplication({
    company: "Stripe", title: "SWE", status: "applied",
    url: "https://x", salary: "$180k", location: "Remote", description: "JD text",
  });
  expect(jobCreate).not.toHaveBeenCalled();
  expect(appCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        company: "Stripe", title: "SWE", status: "applied",
        url: "https://x", salary: "$180k", location: "Remote", description: "JD text",
      }),
    })
  );
});
```

(Keep whatever mock-setup style the existing file uses — mirror its `vi.mock("@/lib/db", ...)` block, just drop the `job` mock methods that are no longer called.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/applications/actions.test.ts`
Expected: FAIL (actions still create/read `prisma.job`).

- [ ] **Step 3: Rewrite `actions.ts`**

Replace the file with:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordApplicationEvent } from "@/lib/applications/events";

type Status = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export async function updateStatus(applicationId: string, status: Status) {
  const user = await requireUser();
  const current = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { status: true },
  });
  if (!current) return;
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { status, appliedAt: status === "applied" ? new Date() : undefined },
  });
  if (current.status !== status) {
    await recordApplicationEvent({
      applicationId, userId: user.id, type: "status_change",
      fromStatus: current.status, toStatus: status,
    });
  }
  revalidatePath("/applications");
}

/** Set status to Applied and stamp the applied date to now (always overwrites). */
export async function markAppliedToday(applicationId: string) {
  const user = await requireUser();
  const current = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { status: true },
  });
  if (!current) return;
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { status: "applied", appliedAt: new Date() },
  });
  if (current.status !== "applied") {
    await recordApplicationEvent({
      applicationId, userId: user.id, type: "status_change",
      fromStatus: current.status, toStatus: "applied",
    });
  }
  revalidatePath("/applications");
}

export async function updateNotes(applicationId: string, notes: string) {
  const user = await requireUser();
  await prisma.application.updateMany({
    where: { id: applicationId, userId: user.id },
    data: { notes },
  });
  revalidatePath("/applications");
}

export interface ManualApplicationInput {
  company: string;
  title: string;
  status: Status;
  url?: string;
  salary?: string;
  location?: string;
  description?: string;
  appliedAt?: Date | null;
  notes?: string;
}

/** Create a standalone application for a role tracked anywhere. */
export async function createManualApplication(input: ManualApplicationInput) {
  const user = await requireUser();
  const company = input.company.trim();
  const title = input.title.trim();
  if (!company) throw new Error("Company is required.");
  if (!title) throw new Error("Role is required.");

  const appliedAt =
    input.appliedAt ?? (input.status !== "saved" ? new Date() : null);

  const application = await prisma.application.create({
    data: {
      userId: user.id,
      company,
      title,
      status: input.status,
      url: input.url?.trim() || null,
      salary: input.salary?.trim() || null,
      location: input.location?.trim() || null,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      appliedAt,
    },
  });

  await recordApplicationEvent({
    applicationId: application.id,
    userId: user.id,
    type: "created",
    toStatus: input.status,
  });

  revalidatePath("/applications");
}

export interface ApplicationDetailInput {
  notes?: string;
  appliedAt?: Date | null;
  salary?: string;
  location?: string;
  url?: string;
  description?: string;
}

/** Update an application's own fields. All fields live on Application now. */
export async function updateApplicationDetails(
  applicationId: string,
  input: ApplicationDetailInput
) {
  const user = await requireUser();
  const app = await prisma.application.findFirst({
    where: { id: applicationId, userId: user.id },
    select: { id: true },
  });
  if (!app) return;

  await prisma.application.update({
    where: { id: app.id },
    data: {
      notes: input.notes ?? undefined,
      appliedAt: input.appliedAt === undefined ? undefined : input.appliedAt,
      salary: input.salary !== undefined ? input.salary.trim() || null : undefined,
      location: input.location !== undefined ? input.location.trim() || null : undefined,
      url: input.url !== undefined ? input.url.trim() || null : undefined,
      description: input.description !== undefined ? input.description.trim() || null : undefined,
    },
  });

  revalidatePath("/applications");
}

/** Delete an application. */
export async function deleteApplication(applicationId: string) {
  const user = await requireUser();
  await prisma.application.deleteMany({
    where: { id: applicationId, userId: user.id },
  });
  revalidatePath("/applications");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/applications/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/actions.ts src/lib/applications/actions.test.ts
git commit -m "refactor(applications): flat create/edit/delete actions, drop paste-Job juggling"
```

---

### Task 4: Update the application query + shared row type

**Files:**
- Modify: `src/app/(app)/applications/page.tsx`
- Modify: `src/lib/applications/table.ts`
- Modify: `src/lib/applications/table.test.ts`
- Modify: `src/lib/applications/kanban.ts`
- Modify: `src/lib/applications/kanban.test.ts`

**Interfaces:**
- Produces: `export type ApplicationRow = Application` (from `@prisma/client`), exported from `page.tsx`, replacing `AppWithJob`. Consumed by `table.ts`, `kanban.ts`, and all application components (Task 5).

- [ ] **Step 1: Update the page query + type**

In `src/app/(app)/applications/page.tsx`:
- Change the import on line 1 from `import { Prisma } from "@prisma/client";` to `import type { Application } from "@prisma/client";`
- Replace the `AppWithJob` type (line 10) with: `export type ApplicationRow = Application;`
- Remove `include: { job: true },` from the `prisma.application.findMany` call (line 23).

- [ ] **Step 2: Update `table.ts`**

In `src/lib/applications/table.ts`:
- Line 1: `import type { ApplicationRow } from "@/app/(app)/applications/page";`
- Add: `import { parseSalaryRange } from "@/lib/applications/salary";`
- Replace every `AppWithJob` with `ApplicationRow`.
- In `filterApplications`, change the search haystack (line 55) to: `const hay = \`${app.company} ${app.title}\`.toLowerCase();`
- In `sortApplications` `company` case, change `a.job.company`/`a.job.title` to `a.company`/`a.title` (and same for `b`).
- In the `status` case tiebreak, change `a.job.company`/`b.job.company` to `a.company`/`b.company`.
- In the `salary` case (lines 92-95), change to:

```ts
    case "salary":
      return copy.sort((a, b) =>
        nullsLast(
          parseSalaryRange(a.salary).salaryMin,
          parseSalaryRange(b.salary).salaryMin,
          flip
        )
      );
```

- In `summarize`, no `.job` references — leave as is.

- [ ] **Step 3: Update `kanban.ts`**

In `src/lib/applications/kanban.ts`, replace every `AppWithJob` with `ApplicationRow` and update the import on line 1 to `import type { ApplicationRow } from "@/app/(app)/applications/page";`. (No `.job` reads exist here — logic is unchanged.)

- [ ] **Step 4: Update the two test files**

In `src/lib/applications/table.test.ts` and `src/lib/applications/kanban.test.ts`, replace the mock application fixtures: flatten `job: { company, title, salary, salaryMin, ... }` into top-level `company`, `title`, `salary` (free-text string) fields on the application object, and drop `salaryMin`. Where a salary sort is asserted, use free-text values the parser understands (e.g. `salary: "$180k"` vs `salary: "$90k"`) and keep the expected order. Update any `AppWithJob` type import to `ApplicationRow`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/applications/table.test.ts src/lib/applications/kanban.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/applications/page.tsx" src/lib/applications/table.ts src/lib/applications/table.test.ts src/lib/applications/kanban.ts src/lib/applications/kanban.test.ts
git commit -m "refactor(applications): flatten row type + query, sort salary from free-text"
```

---

### Task 5: Update application component read sites

Every component that read `app.job.X` now reads `app.X`. The detail panel also loses `descriptionHtml`/`descriptionText`/`source` — it shows the single `description` string.

**Files:**
- Modify: `src/components/applications-table.tsx`
- Modify: `src/components/application-card.tsx`
- Modify: `src/components/application-detail-panel.tsx`
- Modify: `src/components/application-context-menu.tsx`
- Modify: `src/components/tooltip-job-preview.tsx`
- Modify: `src/components/application-kanban.tsx` (type import only, if it imports `AppWithJob`)
- Modify: `src/components/applications-table.test.tsx` (fixtures)

**Interfaces:**
- Consumes: `ApplicationRow` from `@/app/(app)/applications/page`.

- [ ] **Step 1: Swap `AppWithJob` → `ApplicationRow` imports**

In each of the files above that import `AppWithJob`, change the import and type name to `ApplicationRow`.

- [ ] **Step 2: Replace `.job.` reads (mechanical)**

Apply these exact substitutions:
- `applications-table.tsx`: `app.job.company`→`app.company` (lines ~280,282), `app.job.title`→`app.title` (283), `app.job.salary`→`app.salary` (294).
- `application-card.tsx`: `app.job.title`→`app.title` (84), `app.job.company`→`app.company` (99), `app.job.location`→`app.location` (100), `app.job.url`→`app.url` (136,138).
- `application-context-menu.tsx`: `app.job.url`→`app.url` (78,80).
- `tooltip-job-preview.tsx`: `app.job.title`→`app.title` (18), `app.job.company`→`app.company` (20), `app.job.location`→`app.location` (21).

- [ ] **Step 3: Simplify `application-detail-panel.tsx`**

- Remove the `isPaste`, `hasHtml`, `hasText` locals (lines 51-53).
- Replace `app.job.company`→`app.company`, `app.job.title`→`app.title`, `app.job.salary`→`app.salary`, `app.job.location`→`app.location`, `app.job.url`→`app.url` throughout.
- Replace the description block (the `dangerouslySetInnerHTML` on `descriptionHtml` and the `descriptionText` fallback, lines ~152-161) with a single plain-text render:

```tsx
{app.description ? (
  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{app.description}</p>
) : (
  <p className="text-sm text-muted-foreground">No description saved.</p>
)}
```

- Remove the `disabled={!isPaste}` attribute from the salary/location/url `Input`s (lines ~204,209,212) so all fields are always editable. Add a `description` field to the edit form if the panel submits `updateApplicationDetails` (wire a `<Textarea name="description" defaultValue={app.description ?? ""} />` and include `description` in the submitted payload).

- [ ] **Step 4: Update `applications-table.test.tsx` fixtures**

Flatten the `job: { ... }` fixture objects into top-level `company`/`title`/`salary`/`location`/`url` fields; drop `source`/`descriptionHtml`/`descriptionText`/`salaryMin`.

- [ ] **Step 5: Typecheck the touched components**

Run: `npx tsc --noEmit`
Expected: Errors only in files not yet touched (Task 6 targets: `dashboard/lists.ts`, `health/app-updates.ts`, `gmail/suggestions.ts`, `updates-feed.tsx`, `trigger/sync-gmail.ts`) plus files slated for deletion in Task 8. No errors in the components edited here.

- [ ] **Step 6: Run the component test**

Run: `npx vitest run src/components/applications-table.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/applications-table.tsx src/components/application-card.tsx src/components/application-detail-panel.tsx src/components/application-context-menu.tsx src/components/tooltip-job-preview.tsx src/components/application-kanban.tsx src/components/applications-table.test.tsx
git commit -m "refactor(applications): read flat fields in tracker components"
```

---

### Task 6: Update remaining lib/query read sites (first full-green gate)

**Files:**
- Modify: `src/lib/dashboard/lists.ts` + `src/lib/dashboard/lists.test.ts`
- Modify: `src/lib/health/app-updates.ts` + `src/lib/health/app-updates.test.ts`
- Modify: `src/lib/gmail/suggestions.ts`
- Modify: `src/components/dashboard/updates-feed.tsx`
- Modify: `src/trigger/sync-gmail.ts`

**Interfaces:**
- These consume `Application` fields directly (`.company`, `.title`) instead of `.job.company` etc., and drop `include: { job: true }`.

- [ ] **Step 1: `lists.ts`**

Remove `include: { job: true },` from both `findMany` calls (lines ~23, ~41). Change `r.job.title` (line 29) to `r.job` no longer exists → use `r.title`. Verify what fields the mapping selects; if it used `select`, add `title`/`company` to the select. Update `lists.test.ts` fixtures (flatten `job: { title, company, url }` to top-level; drop the `expect(args.include).toEqual({ job: true })` assertions).

- [ ] **Step 2: `health/app-updates.ts`**

- Line 11: change the shape type `job: { title: string; company: string }` — keep the OUTPUT shape as `job: { title, company }` if `updates-feed.tsx` still expects it, OR flatten it. Simpler: flatten the output. Change the returned object (line 39) from `job: { title: row.application.job.title, company: row.application.job.company }` to `title: row.application.job.title, company: row.application.job.company` → but `row.application.job` no longer exists. So:
  - Change the query include (line 27) from `include: { application: { include: { job: true } } }` to `include: { application: { select: { id: true, company: true, title: true } } }`.
  - Change the mapping (line 39) to read `row.application.company` / `row.application.title`.
  - Update the interface (line 11) to `title: string; company: string;` (flattened) and update `updates-feed.tsx` accordingly (Step 4).
- Update `app-updates.test.ts` fixtures: replace `application: { id, job: { title, company } }` with `application: { id, company, title }`, and the expected output `job: {...}` with flat `title`/`company`. Update the `expect(...).include` assertion to the new `select` shape.

- [ ] **Step 3: `gmail/suggestions.ts`**

- Change the `PendingSuggestion` interface (line 17) `application: { id: string; job: { title: string; company: string } } | null;` to `application: { id: string; company: string; title: string } | null;`
- Change the query (line 24) `include: { application: { include: { job: true } } }` to `include: { application: { select: { id: true, company: true, title: true } } }`.
- Change the mapping (lines 32-37): `r.application?.job.company`→`r.application?.company`, `r.application?.job.title`→`r.application?.title`, and the returned `application` object to `{ id: r.application.id, company: r.application.company, title: r.application.title }`.

- [ ] **Step 4: `updates-feed.tsx`**

Change line 59 `{u.job.title} · {u.job.company}` to `{u.title} · {u.company}` (matching the flattened `app-updates` output shape). If the `SuggestedUpdates` card consumes `suggestion.application.job.*`, update it to `.company`/`.title` too — grep the component for `.job.` and fix.

- [ ] **Step 5: `trigger/sync-gmail.ts`**

- Find the `prisma.application.findMany`/`findFirst` that builds match candidates (it currently `include`s or reads `a.job.company`, line ~61). Change the query to `select: { id: true, company: true, status: true }` (drop the job include) and change `a.job.company` to `a.company`.

- [ ] **Step 6: Full green gate**

Run: `npx tsc --noEmit`
Expected: The ONLY remaining errors are in files scheduled for deletion in Task 8 (`lib/jobs/*`, `lib/match/*`, `/jobs/page.tsx`, `/api/match/route.ts`, `poll-jobs.ts`, `dashboard/new-jobs.ts`, `health/new-jobs.ts`, `analytics/market.ts`, the `job-*` components, and `save-job-button.tsx` — which references the removed `addApplication`) and Task 9 (`analytics/market*`). If any non-doomed file still errors, fix it before proceeding.

Run: `npx vitest run src/lib/dashboard/lists.test.ts src/lib/health/app-updates.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/dashboard/lists.ts src/lib/dashboard/lists.test.ts src/lib/health/app-updates.ts src/lib/health/app-updates.test.ts src/lib/gmail/suggestions.ts src/components/dashboard/updates-feed.tsx src/trigger/sync-gmail.ts
git commit -m "refactor: read flat Application fields in dashboard, health, gmail, sync"
```

---

### Task 7: Add the Job description field to the add form

**Files:**
- Modify: `src/components/add-job-dialog.tsx`

**Interfaces:**
- Consumes: `createManualApplication` (`ManualApplicationInput` now has optional `description`).

- [ ] **Step 1: Add the field to the form**

In `src/components/add-job-dialog.tsx`, after the Notes field (line ~118) add a description textarea:

```tsx
<Field label="Job description">
  <Textarea
    name="description"
    placeholder="Paste the job posting — used later to tailor your resume."
    className="min-h-24"
  />
</Field>
```

- [ ] **Step 2: Pass it through on submit**

In `handleSubmit`, add to the `createManualApplication({ ... })` call:

```ts
        description: String(fd.get("description") ?? ""),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: same doomed-file errors as Task 6, nothing new.

- [ ] **Step 4: Commit**

```bash
git add src/components/add-job-dialog.tsx
git commit -m "feat(applications): add optional job-description field to manual add"
```

---

### Task 8: Delete the job-ingestion surface

**Files (delete):**
- Route: `src/app/(app)/jobs/` (whole dir), `src/app/api/match/` (whole dir)
- Trigger: `src/trigger/poll-jobs.ts`
- Lib: `src/lib/jobs/` (whole dir — including the now-relocated `salary.ts`), `src/lib/match/` (whole dir), `src/lib/dashboard/new-jobs.ts` (+`.test.ts`), `src/lib/health/new-jobs.ts` (+`.test.ts`)
- Components: `src/components/jobs-browser.tsx`, `job-card.tsx`, `job-list-item.tsx`, `job-detail-pane.tsx` (+`.test.tsx`), `job-filter-chips.tsx`, `job-scope-tabs.tsx`, `job-search-bar.tsx`, `job-browser-types.ts` (+`.test.ts`), `new-jobs-card.tsx`, `src/components/dashboard/new-jobs-rail.tsx` (+`.test.tsx`)
- Scripts: `scripts/run-poll.ts`, `scripts/backfill-descriptions.ts`, `scripts/backfill-enrichment.ts`

**Files (modify):**
- `src/components/app-nav.tsx` — remove the Jobs nav item
- `package.json` — remove the `poll` script

- [ ] **Step 1: Delete the files/dirs**

```bash
git rm -r "src/app/(app)/jobs" src/app/api/match src/trigger/poll-jobs.ts \
  src/lib/jobs src/lib/match \
  src/lib/dashboard/new-jobs.ts src/lib/dashboard/new-jobs.test.ts \
  src/lib/health/new-jobs.ts src/lib/health/new-jobs.test.ts \
  src/components/jobs-browser.tsx src/components/job-card.tsx \
  src/components/job-list-item.tsx src/components/job-detail-pane.tsx \
  src/components/job-detail-pane.test.tsx src/components/job-filter-chips.tsx \
  src/components/job-scope-tabs.tsx src/components/job-search-bar.tsx \
  src/components/job-browser-types.ts src/components/job-browser-types.test.ts \
  src/components/new-jobs-card.tsx src/components/save-job-button.tsx \
  src/components/dashboard/new-jobs-rail.tsx \
  src/components/dashboard/new-jobs-rail.test.tsx \
  scripts/run-poll.ts scripts/backfill-descriptions.ts scripts/backfill-enrichment.ts
```

(If any path doesn't exist, drop it from the command — verify with `ls` first.)

- [ ] **Step 2: Remove the Jobs nav item**

In `src/components/app-nav.tsx`, delete the line: `{ href: "/jobs", label: "Jobs", icon: Briefcase },` and remove the now-unused `Briefcase` import if nothing else uses it.

- [ ] **Step 3: Remove the `poll` script**

In `package.json`, delete the `"poll": "npx tsx ..."` line from `scripts`.

- [ ] **Step 4: Check for stragglers**

Run:
```bash
grep -rn "lib/jobs\|lib/match\|new-jobs\|jobs-browser\|poll-jobs\|/jobs\|prisma\.job\b\|prisma\.match\b\|prisma\.userSavedJob\|JobSource" src app scripts
```
Expected: no results (except possibly landing copy handled in Task 12). Fix any real import that survived.

- [ ] **Step 5: Verify build + tests**

Run: `npx tsc --noEmit`
Expected: no errors from these deletions. Remaining errors, if any, are only Task 9's `analytics/market*`.
Run: `npm test`
Expected: PASS (deleted tests gone; nothing imports removed modules).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove job-ingestion surface (jobs feed, poll-jobs, lib/jobs, lib/match)"
```

---

### Task 9: Remove the Market analytics tab

**Files:**
- Delete: `src/lib/analytics/market.ts` (+`market.test.ts`), the market-tab components under `src/components/analytics/` (identify with `ls`; the volume/salary/tech/remote components from commit `6c954ec`)
- Modify: `src/components/analytics/analytics-tabs.tsx` — collapse to personal-only
- Modify: `src/app/(app)/analytics/page.tsx` — drop market data fetching
- Modify: `src/lib/analytics/types.ts` — remove market result types if unused elsewhere

- [ ] **Step 1: Inspect the analytics module**

Run: `ls src/components/analytics && grep -n "market\|Market\|tab\|Tab" src/components/analytics/analytics-tabs.tsx "src/app/(app)/analytics/page.tsx"`
Note which components are market-only vs personal.

- [ ] **Step 2: Delete market lib + components**

```bash
git rm src/lib/analytics/market.ts src/lib/analytics/market.test.ts
# plus each market-only component file identified in Step 1, e.g.:
# git rm src/components/analytics/market-*.tsx
```

- [ ] **Step 3: Collapse the tab switcher**

In `analytics-tabs.tsx`, remove the Market tab trigger and panel; render the personal analytics content directly (no tab chrome if only one view remains). If the switcher component becomes an empty shell, inline the personal panel into `page.tsx` and delete `analytics-tabs.tsx`.

- [ ] **Step 4: Update the page**

In `src/app/(app)/analytics/page.tsx`, remove the `getMarketAnalytics` (or equivalent) import and call; keep only `getPersonalAnalytics`. Remove market result types from `types.ts` if now unused (grep first).

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` → Expected: clean (zero errors).
Run: `npm test` → Expected: PASS.
Run: `next build` → Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(analytics): drop Market tab, keep Personal analytics"
```

---

### Task 10: Reflow the dashboard

**Files:**
- Modify: `src/lib/dashboard/summary.ts` + `src/lib/dashboard/summary.test.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Update `summary.ts`**

Remove the `getNewJobsForUser` import and its entry in the `Promise.all`, and drop `newJobs` from the returned object:

```ts
import { getApplicationTrend } from "./application-trend";
import { getDigestWindow } from "./digest-window";
import { getRecentAppUpdates } from "@/lib/health/app-updates";
import { getPendingSuggestions } from "@/lib/gmail/suggestions";
import { getActivityStats } from "./stats";
import { getInterviewing } from "./lists";

export async function getDashboardSummary(userId: string) {
  const { windowStart, previousVisitAt } = await getDigestWindow(userId);
  const [applicationTrend, appUpdates, pendingSuggestions, activityStats, interviewing] =
    await Promise.all([
      getApplicationTrend(userId),
      getRecentAppUpdates(userId, windowStart, previousVisitAt),
      getPendingSuggestions(userId),
      getActivityStats(userId),
      getInterviewing(userId),
    ]);
  return { previousVisitAt, applicationTrend, appUpdates, pendingSuggestions, activityStats, interviewing };
}
```

- [ ] **Step 2: Update `summary.test.ts`**

Remove any `newJobs` mock/assertion; assert the returned object no longer has `newJobs`.

- [ ] **Step 3: Update the dashboard page**

In `src/app/(app)/dashboard/page.tsx`, remove the `NewJobsRail` import (line 7) and its JSX block (lines 41-49). The right column becomes just `<InterviewingCard rows={summary.interviewing} />`. Keep the two-column grid; it reads fine with a single right-column card.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx vitest run src/lib/dashboard/summary.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/summary.ts src/lib/dashboard/summary.test.ts "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): remove New Jobs rail, reflow right column"
```

---

### Task 11: Rewrite the demo seed

**Files:**
- Modify: `src/lib/demo/seed.ts`
- Modify: `scripts/seed-demo.ts`, `scripts/seed-applications.ts`, `scripts/seed-mock.ts`, `scripts/seed/` (only the ones that create `prisma.job`)

- [ ] **Step 1: Find job-creating seed code**

Run: `grep -rn "prisma.job\|prisma.match\|prisma.userSavedJob\|source:" src/lib/demo scripts`

- [ ] **Step 2: Rewrite `src/lib/demo/seed.ts`**

Replace the `prisma.job.deleteMany` + `prisma.job.create` + linked `application.create` pattern (lines ~92-onward) with direct standalone application creation. For each demo application, create it with flat fields:

```ts
await prisma.application.create({
  data: {
    userId,
    company: row.company,
    title: row.title,
    location: row.location ?? null,
    salary: row.salary ?? null,
    url: row.url ?? null,
    description: row.description ?? null,
    status: row.status,
    appliedAt: row.appliedAt ?? null,
  },
});
```

Remove the `prisma.job.deleteMany` cleanup; instead clear demo applications directly: `await prisma.application.deleteMany({ where: { userId } });` (events cascade). Adjust the demo fixture array to carry `company`/`title`/etc. directly instead of nested job objects.

- [ ] **Step 3: Update the standalone seed scripts**

Apply the same flattening to any `scripts/seed*.ts` that created jobs. Delete scripts that existed only to seed the job feed (verify each isn't referenced by `package.json`).

- [ ] **Step 4: Run the demo seed against the dev DB**

Run: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/seed-demo.ts`
Expected: completes; demo user has standalone applications, no job rows.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo/seed.ts scripts
git commit -m "feat(demo): seed standalone applications, no job rows"
```

---

### Task 12: Landing/README copy + e2e + final verification

**Files:**
- Modify: `src/components/landing/feature-showcase.tsx`
- Modify: `README.md`
- Delete: `e2e/jobs.spec.ts`
- Modify: `e2e/applications.spec.ts`, `e2e/dashboard.spec.ts` (remove job-feed assertions)

- [ ] **Step 1: Rewrite the landing feature copy**

In `src/components/landing/feature-showcase.tsx`, remove the "live job feed / hourly ingestion" feature block. Lead the feature list with **email-driven auto-tracking** and the **application tracker**; add a "coming soon: resume tailoring" line only if the section already teases upcoming work (otherwise omit — YAGNI).

- [ ] **Step 2: Update the README**

- Remove the "Live job feed" bullet from Features.
- In the architecture diagram, delete the `poll-jobs (hourly) → ingest ATS + aggregators` line (keep `sync-gmail`).
- In the tech table / prose, remove references to ATS ingestion and the Market analytics tab.
- Update the one-liner/intro so it no longer claims "pulls fresh roles from company ATS boards … every hour."

- [ ] **Step 3: Fix the e2e specs**

```bash
git rm e2e/jobs.spec.ts
```
In `e2e/applications.spec.ts`, remove any step that adds an application "from the job feed"; keep/adjust the manual-add-dialog flow (now includes a description field). In `e2e/dashboard.spec.ts`, remove assertions about the New Jobs rail.

- [ ] **Step 4: Full verification**

Run each and confirm output:
- `npx tsc --noEmit` → no errors
- `npm test` → all pass
- `next build` → succeeds
- `npm run e2e` → all pass (requires the app + a seeded DB per `playwright.config.ts`)

- [ ] **Step 5: Grep for any last job references**

Run: `grep -rin "job feed\|ingest\|greenhouse\|lever\|ashby\|poll-jobs\|market analytics\|salaryMin\|UserSavedJob" src app README.md e2e`
Expected: no functional references (salary-parser internals aside). Clean up stragglers.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: repoint landing/README on email-driven tracking, prune job-feed e2e"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §1 data model → Task 1; §2 deletions → Tasks 8, 9, 10; §3 create/edit paths → Task 3 (+ `suggest_new` already wired via `confirmSuggestion`, verified — no new code); §4 manual-add description field → Task 7; §5 dashboard/analytics/nav/landing → Tasks 8 (nav), 9 (analytics), 10 (dashboard), 12 (landing/README); §6 testing → tests folded into each task + Task 12 final gate. Risks/verify list → Task 6 Step 6 + Task 8 Step 4 greps, and the `suggest_new` note.
- **Type consistency:** `ApplicationRow` replaces `AppWithJob` everywhere (Tasks 4-6). `parseSalaryRange` signature matches its origin (Task 2). `app-updates`/`suggestions` output shapes flattened consistently and their consumers (`updates-feed`, `SuggestedUpdates`) updated in Task 6.
- **Open item for implementer:** `lists.ts` may use `select` vs `include` — Step 1 of Task 6 says verify and add `title`/`company` to any `select`. Same for anywhere a query used `include: { job: true }` with a downstream `.company`/`.title` read.
