# Dashboard Digest Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the dashboard from a 7-widget control center into a daily digest — "what's new since you last looked" — with an Updates feed, a New Jobs rail, and a secondary trend strip.

**Architecture:** A new `ApplicationEvent` table records real status transitions (the spine the future Gmail integration writes to); the Updates feed reads it. A `lastDashboardVisitAt` timestamp drives a "since last visit (min 24h)" window. The New Jobs feed reuses the Jobs-page curated pool (`buildJobWhere`) and excludes jobs already in the user's pipeline. Removed widgets stay in the codebase but leave the dashboard composition.

**Tech Stack:** Next.js (App Router, Server Components), Prisma + Neon Postgres, Vitest (unit, mock `@/lib/db`), Tailwind, Recharts.

**Reference spec:** `docs/superpowers/specs/2026-06-10-dashboard-digest-redesign-design.md`

**Conventions in this codebase:**
- Unit tests mock prisma via `vi.mock("@/lib/db", () => ({ prisma: { ... } }))` and assert query args. See `src/lib/health/app-updates.test.ts` for the canonical pattern.
- Server actions live in files with `"use server"` and call `requireUser()` from `@/lib/auth`.
- Run a single test file: `pnpm vitest run src/path/to/file.test.ts`. Run all: `pnpm test`.
- `userId` scoping is the project's #1 invariant — every query filters by it.

---

## File Structure

- `prisma/schema.prisma` — **Modify:** add `ApplicationEvent` model, `AppEventType` enum, `User.lastDashboardVisitAt`, back-relations on `User` and `Application`.
- `src/lib/dashboard/digest-window.ts` — **Create:** pure `computeWindowStart` + DB wrappers `getDigestWindow` / `stampDashboardVisit`.
- `src/lib/applications/events.ts` — **Create:** `recordApplicationEvent` helper used by the actions.
- `src/lib/applications/actions.ts` — **Modify:** emit events on create + status change.
- `src/lib/health/app-updates.ts` — **Modify (rewrite):** read `ApplicationEvent` instead of `Application.updatedAt`.
- `src/lib/dashboard/new-jobs.ts` — **Modify (rewrite):** take `userId` + `windowStart`, reuse `buildJobWhere`, exclude pipeline jobs.
- `src/lib/dashboard/summary.ts` — **Modify:** slim loader to digest-only data.
- `src/components/dashboard/updates-feed.tsx` — **Create:** primary Updates column (adapts `app-updates-card`).
- `src/components/dashboard/new-jobs-rail.tsx` — **Create:** right-rail New Jobs (adapts `new-jobs-card`).
- `src/app/(app)/dashboard/page.tsx` — **Modify:** recompose to Layout B, new header, stamp visit.
- Test files alongside each `src/lib` module.

---

## Task 1: Schema — ApplicationEvent, AppEventType, lastDashboardVisitAt

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the enum and model**

Add after the existing `AppStatus` enum (around `prisma/schema.prisma:172`):

```prisma
enum AppEventType {
  created
  status_change
  // future: email_detected (written by the Gmail integration)
}

model ApplicationEvent {
  id            String       @id @default(cuid())
  applicationId String
  userId        String
  type          AppEventType
  fromStatus    AppStatus?
  toStatus      AppStatus?
  summary       String?
  createdAt     DateTime     @default(now())

  application   Application  @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

- [ ] **Step 2: Add the back-relation + field on `User`**

In `model User` (around `prisma/schema.prisma:9`), add these two lines among the existing fields/relations:

```prisma
  lastDashboardVisitAt DateTime?
  appEvents            ApplicationEvent[]
```

- [ ] **Step 3: Add the back-relation on `Application`**

In `model Application` (around `prisma/schema.prisma:177`), add:

```prisma
  events    ApplicationEvent[]
```

- [ ] **Step 4: Create and apply the migration**

Run: `pnpm prisma migrate dev --name add_application_events`
Expected: migration created under `prisma/migrations/<timestamp>_add_application_events/`, applied cleanly, and `prisma generate` runs. No errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add ApplicationEvent model + lastDashboardVisitAt"
```

---

## Task 2: Digest window logic

**Files:**
- Create: `src/lib/dashboard/digest-window.ts`
- Test: `src/lib/dashboard/digest-window.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (...a: any) => findUnique(...a),
      update: (...a: any) => update(...a),
    },
  },
}));

import { computeWindowStart, getDigestWindow, stampDashboardVisit } from "@/lib/dashboard/digest-window";

const DAY = 24 * 60 * 60 * 1000;

describe("computeWindowStart", () => {
  const now = new Date("2026-06-10T12:00:00Z");

  it("uses 24h ago when there is no prior visit", () => {
    expect(computeWindowStart(now, null).getTime()).toBe(now.getTime() - DAY);
  });

  it("uses 24h ago when the last visit was less than 24h ago", () => {
    const lastVisit = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3h ago
    expect(computeWindowStart(now, lastVisit).getTime()).toBe(now.getTime() - DAY);
  });

  it("stretches back to the last visit when it was more than 24h ago", () => {
    const lastVisit = new Date(now.getTime() - 3 * DAY); // 3 days ago
    expect(computeWindowStart(now, lastVisit).getTime()).toBe(lastVisit.getTime());
  });
});

describe("getDigestWindow", () => {
  it("reads lastDashboardVisitAt scoped by userId and returns previousVisitAt", async () => {
    const lastVisit = new Date(Date.now() - 3 * DAY);
    findUnique.mockResolvedValueOnce({ lastDashboardVisitAt: lastVisit });

    const { windowStart, previousVisitAt } = await getDigestWindow("user-abc");

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "user-abc" },
      select: { lastDashboardVisitAt: true },
    });
    expect(previousVisitAt).toEqual(lastVisit);
    expect(windowStart.getTime()).toBe(lastVisit.getTime());
  });
});

describe("stampDashboardVisit", () => {
  it("updates lastDashboardVisitAt to ~now for the user", async () => {
    const before = Date.now();
    await stampDashboardVisit("user-abc");
    const [args] = update.mock.calls;
    expect(args[0].where).toEqual({ id: "user-abc" });
    const stamped: Date = args[0].data.lastDashboardVisitAt;
    expect(Math.abs(stamped.getTime() - before)).toBeLessThan(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/dashboard/digest-window.test.ts`
Expected: FAIL — cannot import `computeWindowStart` / module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/dashboard/digest-window.ts
import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Window start = earlier of (now - 24h) or the last visit. Always shows >= 24h. */
export function computeWindowStart(now: Date, lastVisitAt: Date | null): Date {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  if (!lastVisitAt) return dayAgo;
  return lastVisitAt.getTime() < dayAgo.getTime() ? lastVisitAt : dayAgo;
}

export async function getDigestWindow(
  userId: string
): Promise<{ windowStart: Date; previousVisitAt: Date | null }> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastDashboardVisitAt: true },
  });
  const previousVisitAt = row?.lastDashboardVisitAt ?? null;
  return { windowStart: computeWindowStart(new Date(), previousVisitAt), previousVisitAt };
}

export async function stampDashboardVisit(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { lastDashboardVisitAt: new Date() },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/dashboard/digest-window.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/digest-window.ts src/lib/dashboard/digest-window.test.ts
git commit -m "feat(dashboard): digest window logic"
```

---

## Task 3: Event recording helper

**Files:**
- Create: `src/lib/applications/events.ts`
- Test: `src/lib/applications/events.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const create = vi.fn().mockResolvedValue({});
vi.mock("@/lib/db", () => ({
  prisma: { applicationEvent: { create: (...a: any) => create(...a) } },
}));

import { recordApplicationEvent } from "@/lib/applications/events";

beforeEach(() => create.mockClear());

describe("recordApplicationEvent", () => {
  it("creates a created event with a default summary", async () => {
    await recordApplicationEvent({
      applicationId: "a1",
      userId: "u1",
      type: "created",
      toStatus: "saved",
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        applicationId: "a1",
        userId: "u1",
        type: "created",
        fromStatus: undefined,
        toStatus: "saved",
        summary: "Added to tracker",
      },
    });
  });

  it("creates a status_change event with a 'Moved to X' summary", async () => {
    await recordApplicationEvent({
      applicationId: "a1",
      userId: "u1",
      type: "status_change",
      fromStatus: "applied",
      toStatus: "interviewing",
    });
    const [args] = create.mock.calls;
    expect(args[0].data.type).toBe("status_change");
    expect(args[0].data.fromStatus).toBe("applied");
    expect(args[0].data.toStatus).toBe("interviewing");
    expect(args[0].data.summary).toBe("Moved to Interviewing");
  });

  it("prefers an explicit summary when provided", async () => {
    await recordApplicationEvent({
      applicationId: "a1",
      userId: "u1",
      type: "status_change",
      toStatus: "offer",
      summary: "Custom",
    });
    const [args] = create.mock.calls;
    expect(args[0].data.summary).toBe("Custom");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/applications/events.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/applications/events.ts
import { prisma } from "@/lib/db";
import type { AppEventType, AppStatus } from "@prisma/client";

const STATUS_LABEL: Record<AppStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

export interface RecordEventInput {
  applicationId: string;
  userId: string;
  type: AppEventType;
  fromStatus?: AppStatus;
  toStatus?: AppStatus;
  summary?: string;
}

function defaultSummary(input: RecordEventInput): string | undefined {
  if (input.summary) return input.summary;
  if (input.type === "created") return "Added to tracker";
  if (input.type === "status_change" && input.toStatus) {
    return `Moved to ${STATUS_LABEL[input.toStatus]}`;
  }
  return undefined;
}

export async function recordApplicationEvent(input: RecordEventInput): Promise<void> {
  await prisma.applicationEvent.create({
    data: {
      applicationId: input.applicationId,
      userId: input.userId,
      type: input.type,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      summary: defaultSummary(input),
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/applications/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/events.ts src/lib/applications/events.test.ts
git commit -m "feat(applications): recordApplicationEvent helper"
```

---

## Task 4: Emit events from application actions

**Files:**
- Modify: `src/lib/applications/actions.ts`

> Note: these are `"use server"` actions; we wire in `recordApplicationEvent` at the create + status-change points. `updateStatus` must read the current status first so it can record `fromStatus` and skip no-op changes. Note edits (`updateNotes`, `updateApplicationDetails`) deliberately record nothing.

- [ ] **Step 1: Import the helper**

At the top of `src/lib/applications/actions.ts`, after the existing imports:

```typescript
import { recordApplicationEvent } from "@/lib/applications/events";
```

- [ ] **Step 2: Record `created` in `addApplication`**

Replace the body of `addApplication` (currently `src/lib/applications/actions.ts:8-12`):

```typescript
export async function addApplication(jobId: string) {
  const user = await requireUser();
  const app = await prisma.application.create({
    data: { userId: user.id, jobId, status: "saved" },
  });
  await recordApplicationEvent({
    applicationId: app.id,
    userId: user.id,
    type: "created",
    toStatus: "saved",
  });
  revalidatePath("/applications");
}
```

- [ ] **Step 3: Record `status_change` in `updateStatus` (read current status, skip no-ops)**

Replace `updateStatus` (currently `src/lib/applications/actions.ts:14-21`):

```typescript
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
      applicationId,
      userId: user.id,
      type: "status_change",
      fromStatus: current.status,
      toStatus: status,
    });
  }
  revalidatePath("/applications");
}
```

- [ ] **Step 4: Record `status_change` in `markAppliedToday`**

Replace `markAppliedToday` (currently `src/lib/applications/actions.ts:24-31`):

```typescript
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
      applicationId,
      userId: user.id,
      type: "status_change",
      fromStatus: current.status,
      toStatus: "applied",
    });
  }
  revalidatePath("/applications");
}
```

- [ ] **Step 5: Record `created` in `createManualApplication`**

In `createManualApplication`, replace the `prisma.application.create({...})` call (currently `src/lib/applications/actions.ts:77-85`) so it captures the row and records an event:

```typescript
  const application = await prisma.application.create({
    data: {
      userId: user.id,
      jobId: job.id,
      status: input.status,
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
```

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `src/lib/applications/actions.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/applications/actions.ts
git commit -m "feat(applications): emit ApplicationEvents on create and status change"
```

---

## Task 5: Rewrite the Updates reader to use ApplicationEvent

**Files:**
- Modify: `src/lib/health/app-updates.ts`
- Modify: `src/lib/health/app-updates.test.ts`

- [ ] **Step 1: Replace the test**

Replace the entire contents of `src/lib/health/app-updates.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([
  {
    id: "e1",
    type: "status_change",
    toStatus: "interviewing",
    summary: "Moved to Interviewing",
    createdAt: new Date("2026-06-09T10:00:00Z"),
    application: { id: "a1", job: { title: "SWE", company: "Acme" } },
  },
  {
    id: "e2",
    type: "created",
    toStatus: "saved",
    summary: "Added to tracker",
    createdAt: new Date("2026-06-09T09:00:00Z"),
    application: { id: "a2", job: { title: "PM", company: "Beta" } },
  },
]);
vi.mock("@/lib/db", () => ({
  prisma: { applicationEvent: { findMany: (...a: any) => findMany(...a) } },
}));

import { getRecentAppUpdates } from "@/lib/health/app-updates";

describe("getRecentAppUpdates", () => {
  it("queries events scoped by userId, since windowStart, newest first, with app+job", async () => {
    const windowStart = new Date("2026-06-08T00:00:00Z");
    await getRecentAppUpdates("user-abc", windowStart);

    const [args] = findMany.mock.calls;
    expect(args[0].where.userId).toBe("user-abc");
    expect(args[0].where.createdAt).toEqual({ gte: windowStart });
    expect(args[0].orderBy).toEqual({ createdAt: "desc" });
    expect(args[0].include).toEqual({
      application: { include: { job: true } },
    });
  });

  it("maps rows to display shape, including isNew relative to previousVisitAt", async () => {
    const windowStart = new Date("2026-06-08T00:00:00Z");
    const previousVisitAt = new Date("2026-06-09T09:30:00Z");
    const rows = await getRecentAppUpdates("user-abc", windowStart, previousVisitAt);

    expect(rows[0]).toEqual({
      id: "e1",
      applicationId: "a1",
      status: "interviewing",
      summary: "Moved to Interviewing",
      createdAt: new Date("2026-06-09T10:00:00Z"),
      isNew: true, // after previousVisitAt
      job: { title: "SWE", company: "Acme" },
    });
    expect(rows[1].isNew).toBe(false); // before previousVisitAt
  });

  it("treats every row as new when there is no previous visit", async () => {
    const rows = await getRecentAppUpdates("user-abc", new Date("2026-06-08T00:00:00Z"), null);
    expect(rows.every((r) => r.isNew)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/health/app-updates.test.ts`
Expected: FAIL — signature mismatch / queries the wrong model.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `src/lib/health/app-updates.ts`:

```typescript
import { prisma } from "@/lib/db";
import type { AppStatus } from "@prisma/client";

export type AppUpdate = {
  id: string;
  applicationId: string;
  status: AppStatus | null;
  summary: string | null;
  createdAt: Date;
  isNew: boolean;
  job: { title: string; company: string };
};

/**
 * Recent application updates for the digest, read from the ApplicationEvent log.
 * `windowStart` bounds how far back to look; `previousVisitAt` marks which
 * events are "new" (occurred after the user's prior dashboard visit).
 */
export async function getRecentAppUpdates(
  userId: string,
  windowStart: Date,
  previousVisitAt: Date | null = null,
  limit = 10
): Promise<AppUpdate[]> {
  const rows = await prisma.applicationEvent.findMany({
    where: { userId, createdAt: { gte: windowStart } },
    include: { application: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((row) => ({
    id: row.id,
    applicationId: row.applicationId,
    status: row.toStatus,
    summary: row.summary,
    createdAt: row.createdAt,
    isNew: previousVisitAt ? row.createdAt > previousVisitAt : true,
    job: { title: row.application.job.title, company: row.application.job.company },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/health/app-updates.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/health/app-updates.ts src/lib/health/app-updates.test.ts
git commit -m "feat(dashboard): updates feed reads ApplicationEvent log"
```

---

## Task 6: Rewrite New Jobs to use the curated pool + exclude pipeline

**Files:**
- Modify: `src/lib/dashboard/new-jobs.ts`
- Modify: `src/lib/dashboard/new-jobs.test.ts`

- [ ] **Step 1: Replace the test**

Replace the entire contents of `src/lib/dashboard/new-jobs.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/db", () => ({
  prisma: { job: { findMany: (...a: any) => findMany(...a) } },
}));

import { getNewJobsForUser } from "@/lib/dashboard/new-jobs";

describe("getNewJobsForUser", () => {
  it("filters by curated pool, window, and excludes the user's pipeline jobs", async () => {
    const windowStart = new Date("2026-06-09T00:00:00Z");
    await getNewJobsForUser("user-abc", windowStart);

    const [args] = findMany.mock.calls;
    const where = args[0].where;

    // composed with AND of: curated base, posted window, not-in-pipeline
    expect(Array.isArray(where.AND)).toBe(true);

    const flat = JSON.stringify(where);
    // curated pool markers from buildJobWhere
    expect(flat).toContain('"active":true');
    expect(flat).toContain('"roleCategory"');
    // window
    expect(where.AND.some((c: any) => c.postedAt?.gte?.getTime?.() === windowStart.getTime())).toBe(true);
    // pipeline exclusion
    expect(where.AND.some((c: any) => c.applications?.none?.userId === "user-abc")).toBe(true);

    expect(args[0].orderBy).toEqual({ postedAt: "desc" });
    expect(args[0].take).toBe(5);
  });

  it("honours a custom limit", async () => {
    await getNewJobsForUser("user-abc", new Date(), 10);
    const [args] = findMany.mock.calls;
    expect(args[0].take).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/dashboard/new-jobs.test.ts`
Expected: FAIL — `getNewJobsForUser` not exported.

- [ ] **Step 3: Rewrite the implementation**

Replace the entire contents of `src/lib/dashboard/new-jobs.ts`:

```typescript
// src/lib/dashboard/new-jobs.ts
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";

/**
 * New jobs for the digest: the same curated pool the Jobs page shows
 * (via buildJobWhere with default params), posted since `windowStart`,
 * excluding any job already in the user's pipeline.
 */
export async function getNewJobsForUser(userId: string, windowStart: Date, limit = 5) {
  const curated = buildJobWhere({}, userId);
  return prisma.job.findMany({
    where: {
      AND: [
        curated,
        { postedAt: { gte: windowStart } },
        { applications: { none: { userId } } },
      ],
    },
    orderBy: { postedAt: "desc" },
    take: limit,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/dashboard/new-jobs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/new-jobs.ts src/lib/dashboard/new-jobs.test.ts
git commit -m "feat(dashboard): new jobs feed uses curated pool, excludes pipeline"
```

---

## Task 7: Slim the dashboard summary loader

**Files:**
- Modify: `src/lib/dashboard/summary.ts`
- Modify: `src/lib/dashboard/summary.test.ts`

> The new dashboard needs only: the digest window, new jobs, update events, and the trend. Drop stats, funnel, interviewing, and saved-not-applied from the summary.

- [ ] **Step 1: Inspect the existing summary test**

Run: `pnpm vitest run src/lib/dashboard/summary.test.ts`
Read `src/lib/dashboard/summary.test.ts` to see what it currently asserts. You will rewrite it to assert the slimmed shape in Step 2.

- [ ] **Step 2: Rewrite the test to the slim shape**

Replace the contents of `src/lib/dashboard/summary.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/dashboard/digest-window", () => ({
  getDigestWindow: vi.fn().mockResolvedValue({
    windowStart: new Date("2026-06-09T00:00:00Z"),
    previousVisitAt: new Date("2026-06-09T12:00:00Z"),
  }),
}));
vi.mock("@/lib/dashboard/application-trend", () => ({
  getApplicationTrend: vi.fn().mockResolvedValue([{ weekStart: "2026-06-08", count: 2 }]),
}));
vi.mock("@/lib/dashboard/new-jobs", () => ({
  getNewJobsForUser: vi.fn().mockResolvedValue([{ id: "j1" }]),
}));
vi.mock("@/lib/health/app-updates", () => ({
  getRecentAppUpdates: vi.fn().mockResolvedValue([{ id: "e1", isNew: true }]),
}));

import { getDashboardSummary } from "@/lib/dashboard/summary";

describe("getDashboardSummary", () => {
  it("returns only digest data: window, applicationTrend, newJobs, appUpdates", async () => {
    const summary = await getDashboardSummary("user-abc");

    expect(summary).toEqual({
      previousVisitAt: new Date("2026-06-09T12:00:00Z"),
      applicationTrend: [{ weekStart: "2026-06-08", count: 2 }],
      newJobs: [{ id: "j1" }],
      appUpdates: [{ id: "e1", isNew: true }],
    });
    // removed fields
    expect(summary).not.toHaveProperty("stats");
    expect(summary).not.toHaveProperty("funnel");
    expect(summary).not.toHaveProperty("interviewing");
    expect(summary).not.toHaveProperty("savedNotApplied");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/dashboard/summary.test.ts`
Expected: FAIL — current summary returns the old shape.

- [ ] **Step 4: Rewrite the implementation**

Replace the entire contents of `src/lib/dashboard/summary.ts`:

```typescript
import { getApplicationTrend } from "./application-trend";
import { getNewJobsForUser } from "./new-jobs";
import { getDigestWindow } from "./digest-window";
import { getRecentAppUpdates } from "@/lib/health/app-updates";

export async function getDashboardSummary(userId: string) {
  const { windowStart, previousVisitAt } = await getDigestWindow(userId);

  const [applicationTrend, newJobs, appUpdates] = await Promise.all([
    getApplicationTrend(userId),
    getNewJobsForUser(userId, windowStart),
    getRecentAppUpdates(userId, windowStart, previousVisitAt),
  ]);

  return { previousVisitAt, applicationTrend, newJobs, appUpdates };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/dashboard/summary.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/summary.ts src/lib/dashboard/summary.test.ts
git commit -m "refactor(dashboard): slim summary to digest data"
```

---

## Task 8: Updates feed component (primary column)

**Files:**
- Create: `src/components/dashboard/updates-feed.tsx`
- Test: `src/components/dashboard/updates-feed.test.tsx`
- Reference: read `src/components/app-updates-card.tsx` for the existing badge/list styling to adapt.

> Server-friendly presentational component. Renders a list of updates with a status badge, summary, company/title, relative time, and a subtle "new" dot when `isNew`. Links each row to `/applications`. Shows a friendly empty state when there are none.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdatesFeed } from "@/components/dashboard/updates-feed";

const rows = [
  {
    id: "e1",
    applicationId: "a1",
    status: "interviewing" as const,
    summary: "Moved to Interviewing",
    createdAt: new Date(),
    isNew: true,
    job: { title: "SWE", company: "Acme" },
  },
];

describe("UpdatesFeed", () => {
  it("renders an update row with summary and company", () => {
    render(<UpdatesFeed updates={rows} />);
    expect(screen.getByText("Moved to Interviewing")).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
  });

  it("renders a friendly empty state when there are no updates", () => {
    render(<UpdatesFeed updates={[]} />);
    expect(screen.getByText(/No updates since your last visit/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/dashboard/updates-feed.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/dashboard/updates-feed.tsx
import Link from "next/link";
import type { AppUpdate } from "@/lib/health/app-updates";

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function UpdatesFeed({ updates }: { updates: AppUpdate[] }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Updates</h2>
        {updates.length > 0 && (
          <span className="text-muted-foreground text-xs">{updates.length}</span>
        )}
      </header>

      {updates.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          No updates since your last visit. Status changes will show up here —
          and auto-populate once Gmail is connected.
        </p>
      ) : (
        <ul className="divide-y">
          {updates.map((u) => (
            <li key={u.id}>
              <Link
                href="/applications"
                className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-1 py-3"
              >
                {u.isNew && <span className="h-2 w-2 flex-none rounded-full bg-primary" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {u.summary ?? "Updated"}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {u.job.title} · {u.job.company}
                  </p>
                </div>
                <span className="text-muted-foreground flex-none text-xs">
                  {timeAgo(u.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/dashboard/updates-feed.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/updates-feed.tsx src/components/dashboard/updates-feed.test.tsx
git commit -m "feat(dashboard): UpdatesFeed component"
```

---

## Task 9: New Jobs rail component

**Files:**
- Create: `src/components/dashboard/new-jobs-rail.tsx`
- Test: `src/components/dashboard/new-jobs-rail.test.tsx`
- Reference: read `src/components/new-jobs-card.tsx` for the existing row/link styling to adapt.

> Right-rail list of new jobs. Each row links to the job's external `url` when present, else to `/jobs`. Footer "View all jobs →" links to `/jobs`. Friendly empty state.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NewJobsRail } from "@/components/dashboard/new-jobs-rail";

const jobs = [
  { id: "j1", title: "Frontend Engineer", company: "Linear", location: "Remote", url: "https://x" },
];

describe("NewJobsRail", () => {
  it("renders a job row and the view-all link", () => {
    render(<NewJobsRail jobs={jobs} />);
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText(/View all jobs/i)).toBeInTheDocument();
  });

  it("renders a friendly empty state when caught up", () => {
    render(<NewJobsRail jobs={[]} />);
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/dashboard/new-jobs-rail.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Write the implementation**

```tsx
// src/components/dashboard/new-jobs-rail.tsx
import Link from "next/link";

export type NewJobRow = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
};

export function NewJobsRail({ jobs }: { jobs: NewJobRow[] }) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">New jobs</h2>
        {jobs.length > 0 && (
          <span className="text-muted-foreground text-xs">{jobs.length}</span>
        )}
      </header>

      {jobs.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          You&apos;re caught up — no new matches in your search.
        </p>
      ) : (
        <ul className="divide-y">
          {jobs.map((job) => {
            const href = job.url ?? "/jobs";
            const external = Boolean(job.url);
            return (
              <li key={job.id}>
                <Link
                  href={href}
                  {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="hover:bg-muted/50 block rounded-md px-1 py-3"
                >
                  <p className="truncate text-sm font-medium">{job.title}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {job.company}
                    {job.location ? ` · ${job.location}` : ""}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        href="/jobs"
        className="text-primary mt-3 inline-block text-xs font-medium hover:underline"
      >
        View all jobs →
      </Link>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/dashboard/new-jobs-rail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/new-jobs-rail.tsx src/components/dashboard/new-jobs-rail.test.tsx
git commit -m "feat(dashboard): NewJobsRail component"
```

---

## Task 10: Recompose the dashboard page (Layout B)

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

> Layout B: header + a two-column grid (Updates primary ~1.7fr, New Jobs rail ~1fr); the trend chart sits as a secondary strip under the Updates column. Stamp the visit AFTER loading the summary so the current load still reflects the prior visit.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/(app)/dashboard/page.tsx`:

```tsx
import { requireUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard/summary";
import { stampDashboardVisit } from "@/lib/dashboard/digest-window";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { UpdatesFeed } from "@/components/dashboard/updates-feed";
import { NewJobsRail } from "@/components/dashboard/new-jobs-rail";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const summary = await getDashboardSummary(user.id);
  // Stamp AFTER reading, so this load still shows everything since the prior visit.
  await stampDashboardVisit(user.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Dashboard</p>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Good morning, {user.name ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s new since you last checked.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-5">
          <UpdatesFeed updates={summary.appUpdates} />
          <div className="rounded-xl border bg-card p-5">
            <h2 className="mb-2 text-sm font-semibold">Applications over time</h2>
            <ApplicationTrendChart points={summary.applicationTrend} />
          </div>
        </div>

        <NewJobsRail
          jobs={summary.newJobs.map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            url: j.url,
          }))}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If `ApplicationTrendChart` already renders its own card wrapper/title, drop the extra wrapper div to avoid a double border — check `src/components/dashboard/application-trend-chart.tsx` and adjust.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): recompose as digest (Layout B)"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit suite**

Run: `pnpm test`
Expected: all tests pass. If any previously-existing test referenced the removed summary fields (`stats`, `funnel`, `interviewing`, `savedNotApplied`) or the old `getNewJobs24h` / old `getRecentAppUpdates` signatures, update those tests to the new shapes. Note: `stats.test.ts`, `lists.test.ts`, `application-trend.test.ts` test their own modules (still present and unchanged) — they should still pass untouched.

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: clean typecheck and successful build. Removed component imports (`ActivityStatsCard`, `FunnelCard`, `InterviewingCard`, `SavedQueueCard`) are no longer referenced by the dashboard; their files remain but unused — that is expected and fine.

- [ ] **Step 3: Manual smoke test (per project dev-verification convention)**

Start the dev server on port 3050 (`pnpm dev`), mint an authjs DB session to skip OAuth (see project memory `hone-dev-verification`), and open `/dashboard`. Confirm:
- Header reads "Good morning, … / Here's what's new since you last checked."
- Updates column shows recent status changes (change an application's status on `/applications`, reload `/dashboard` → it appears with a "new" dot).
- New Jobs rail shows curated jobs not already in your pipeline; "View all jobs →" links to `/jobs`.
- Trend chart renders below Updates.
- With a fresh/empty state, both feeds show their friendly empty messages rather than blank boxes.

- [ ] **Step 4: Final commit (if any test/build fixups were made)**

```bash
git add -A
git commit -m "test(dashboard): align suite with digest redesign"
```

---

## Self-Review Notes (for the implementer)

- **Spec coverage:** Layout B (Task 10), digest window + `lastDashboardVisitAt` (Tasks 1–2, 10), New Jobs curated-pool + pipeline exclusion (Task 6), `ApplicationEvent` table + event emission (Tasks 1, 3, 4), Updates feed reads events (Task 5), trend kept secondary (Task 10), removed widgets (Tasks 7, 10), empty states (Tasks 8, 9). All covered.
- **Out of scope (do NOT do here):** user job-preferences model/UI, the actual Gmail integration, deleting the now-unused widget components, changes to Applications/Jobs pages beyond reusing `buildJobWhere`.
- **Type consistency:** `getNewJobsForUser(userId, windowStart, limit)`, `getRecentAppUpdates(userId, windowStart, previousVisitAt, limit)`, `getDigestWindow → { windowStart, previousVisitAt }`, `recordApplicationEvent(RecordEventInput)`, `AppUpdate` shape consumed by `UpdatesFeed`, `NewJobRow` shape consumed by `NewJobsRail` — all consistent across tasks.
