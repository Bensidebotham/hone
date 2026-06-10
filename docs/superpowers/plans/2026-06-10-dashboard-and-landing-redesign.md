# Dashboard Refocus + Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the dashboard from resume/profile health onto application tracking (stats, applications-over-time chart, interviewing & saved queues, 24h job feed, clickable funnel, show-more lists), and build a full bold product-marketing landing page at `/`.

**Architecture:** New dashboard query layer under `src/lib/dashboard/` (replacing the health-framed `src/lib/health/summary.ts` as the dashboard's data source) feeds a rebuilt dashboard page. List cards become small `"use client"` components with an inline show-more toggle. The funnel deep-links into a status-filtered `/applications`. The landing page is a Server Component at `src/app/page.tsx` that redirects logged-in users to `/dashboard` and otherwise composes section components from `src/components/landing/`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Tailwind v4 (CSS tokens), base-ui + shadcn primitives, Prisma/Neon, recharts, `motion`, NextAuth v5, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-dashboard-and-landing-redesign-design.md`

---

## File Structure

**Dashboard — created:**
- `src/lib/dashboard/stats.ts` — `getActivityStats(userId)`
- `src/lib/dashboard/application-trend.ts` — `getApplicationTrend(userId)`
- `src/lib/dashboard/lists.ts` — `getInterviewing(userId)`, `getSavedNotApplied(userId)`
- `src/lib/dashboard/new-jobs.ts` — `getNewJobs24h(limit)`
- `src/lib/dashboard/summary.ts` — `getDashboardSummary(userId)` (new home for the rewritten summary)
- `src/components/dashboard/show-more-button.tsx` — shared toggle button
- `src/components/dashboard/activity-stats-card.tsx`
- `src/components/dashboard/application-trend-chart.tsx`
- `src/components/dashboard/interviewing-card.tsx`
- `src/components/dashboard/saved-queue-card.tsx`
- Tests alongside: `*.test.ts(x)` for each lib + the show-more button.

**Dashboard — modified:**
- `src/components/new-jobs-card.tsx` — client, show-more, "View all"
- `src/components/app-updates-card.tsx` — client, show-more, "View all"
- `src/components/funnel-card.tsx` — clickable stage links
- `src/app/(app)/dashboard/page.tsx` — new layout + data source
- `src/app/(app)/dashboard/loading.tsx` — match new layout skeleton
- `src/app/(app)/applications/page.tsx` — read & apply `?status=` filter

**Dashboard — deleted (verified unused outside the dashboard page):**
- `src/components/health-card.tsx`, `src/components/health-trend-chart.tsx`

**Landing — created:**
- `src/components/landing/landing-nav.tsx`
- `src/components/landing/hero.tsx`
- `src/components/landing/app-preview.tsx`
- `src/components/landing/feature-grid.tsx`
- `src/components/landing/how-it-works.tsx`
- `src/components/landing/stats-band.tsx`
- `src/components/landing/faq.tsx`
- `src/components/landing/landing-footer.tsx`
- `src/components/landing/reveal.tsx` — reduced-motion-aware scroll reveal wrapper

**Landing — modified:**
- `src/app/page.tsx` — redirect-if-authed + compose sections

---

## Conventions (read once before starting)

- **Prisma access:** always `import { prisma } from "@/lib/db";`. Every user-scoped query MUST filter `where.userId`.
- **Test style (Vitest):** mock the db with `vi.mock("@/lib/db", () => ({ prisma: { <model>: { <method>: (...a:any)=>fn(...a) } } }))`, declaring the `vi.fn()` above the mock, then `import` the unit under test after the mock. See `src/lib/health/app-updates.test.ts` for the canonical pattern. `globals: true` is set, so `describe/it/expect/vi` are available without import, but existing tests still import them — follow suit.
- **AppStatus values:** `"saved" | "applied" | "interviewing" | "offer" | "rejected"` (from `@prisma/client`).
- **Page header pattern:** `<p className="text-sm font-semibold text-primary">Label</p>` → `<h1 className="text-3xl font-extrabold tracking-tight">Title</h1>` → `<p className="text-muted-foreground mt-1">subtitle</p>`.
- **Card primitive:** `import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";` — rounded-xl, use `className="hover:shadow-sm transition-shadow"` to match siblings.
- **Run a single test file:** `pnpm test -- src/lib/dashboard/stats.test.ts` (vitest run). Run all: `pnpm test`. Typecheck/build: `pnpm build`.
- **Commit cadence:** one commit per task (after its tests pass). Branch is already `feat/dashboard-landing-redesign`.

---

## PHASE A — Dashboard data layer

### Task 1: `getActivityStats`

**Files:**
- Create: `src/lib/dashboard/stats.ts`
- Test: `src/lib/dashboard/stats.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dashboard/stats.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const count = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { count: (...a: any) => count(...a) } },
}));

import { getActivityStats } from "@/lib/dashboard/stats";

describe("getActivityStats", () => {
  beforeEach(() => {
    // order of the 4 count() calls: appliedThisWeek, appliedTotal, interviewing, advanced
    count
      .mockResolvedValueOnce(3)  // appliedThisWeek
      .mockResolvedValueOnce(10) // appliedTotal
      .mockResolvedValueOnce(2)  // interviewing
      .mockResolvedValueOnce(4); // advanced (interviewing+offer)
  });

  it("scopes every count to the userId", async () => {
    await getActivityStats("u1");
    for (const call of count.mock.calls) {
      expect(call[0].where.userId).toBe("u1");
    }
  });

  it("counts appliedThisWeek with appliedAt gte start of week (Monday)", async () => {
    await getActivityStats("u1");
    const args = count.mock.calls[0][0];
    const gte: Date = args.where.appliedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    expect(gte.getDay()).toBe(1); // Monday
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
  });

  it("counts appliedTotal as applications with appliedAt set", async () => {
    await getActivityStats("u1");
    const args = count.mock.calls[1][0];
    expect(args.where.appliedAt).toEqual({ not: null });
  });

  it("counts interviewing by status", async () => {
    await getActivityStats("u1");
    expect(count.mock.calls[2][0].where.status).toBe("interviewing");
  });

  it("computes responseRate = round((interviewing+offer)/appliedTotal * 100)", async () => {
    const result = await getActivityStats("u1");
    expect(result).toEqual({
      appliedThisWeek: 3,
      appliedTotal: 10,
      interviewing: 2,
      responseRate: 40, // 4/10
    });
  });

  it("responseRate is null when appliedTotal is 0", async () => {
    count.mockReset();
    count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const result = await getActivityStats("u1");
    expect(result.responseRate).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/dashboard/stats.test.ts`
Expected: FAIL — cannot find module `@/lib/dashboard/stats`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dashboard/stats.ts
import { prisma } from "@/lib/db";

export type ActivityStats = {
  appliedThisWeek: number;
  appliedTotal: number;
  interviewing: number;
  responseRate: number | null;
};

/** Start of the current week (Monday 00:00 local time). */
function startOfWeek(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

export async function getActivityStats(userId: string): Promise<ActivityStats> {
  const weekStart = startOfWeek();
  const [appliedThisWeek, appliedTotal, interviewing, advanced] = await Promise.all([
    prisma.application.count({ where: { userId, appliedAt: { gte: weekStart } } }),
    prisma.application.count({ where: { userId, appliedAt: { not: null } } }),
    prisma.application.count({ where: { userId, status: "interviewing" } }),
    prisma.application.count({ where: { userId, status: { in: ["interviewing", "offer"] } } }),
  ]);

  const responseRate =
    appliedTotal === 0 ? null : Math.round((advanced / appliedTotal) * 100);

  return { appliedThisWeek, appliedTotal, interviewing, responseRate };
}
```

Note: the test's 4th `count` mock is the `advanced` (interviewing+offer) query.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/dashboard/stats.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/stats.ts src/lib/dashboard/stats.test.ts
git commit -m "feat(dashboard): add getActivityStats query"
```

---

### Task 2: `getApplicationTrend` (10-week, zero-filled)

**Files:**
- Create: `src/lib/dashboard/application-trend.ts`
- Test: `src/lib/dashboard/application-trend.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dashboard/application-trend.test.ts
import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { findMany: (...a: any) => findMany(...a) } },
}));

import { getApplicationTrend, WEEKS } from "@/lib/dashboard/application-trend";

describe("getApplicationTrend", () => {
  it("queries applications with appliedAt set, scoped to userId, gte ~10 weeks ago", async () => {
    findMany.mockResolvedValueOnce([]);
    const before = Date.now();
    await getApplicationTrend("u1");
    const args = findMany.mock.calls[0][0];
    expect(args.where.userId).toBe("u1");
    expect(args.where.appliedAt.not).toBeNull();
    const gte: Date = args.where.appliedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    const tenWeeksMs = WEEKS * 7 * 24 * 60 * 60 * 1000;
    // gte is the Monday on/just before (now - 10 weeks); allow up to 8 days slack
    expect(before - gte.getTime()).toBeGreaterThan(tenWeeksMs - 24 * 60 * 60 * 1000);
    expect(before - gte.getTime()).toBeLessThan(tenWeeksMs + 8 * 24 * 60 * 60 * 1000);
  });

  it("returns exactly WEEKS points, oldest→newest, weekStart as YYYY-MM-DD", async () => {
    findMany.mockResolvedValueOnce([]);
    const result = await getApplicationTrend("u1");
    expect(result).toHaveLength(WEEKS);
    expect(result[0].weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // strictly increasing weekStart
    for (let i = 1; i < result.length; i++) {
      expect(result[i].weekStart > result[i - 1].weekStart).toBe(true);
    }
    // empty data → all zero counts
    expect(result.every((p) => p.count === 0)).toBe(true);
  });

  it("buckets an application into the week containing its appliedAt", async () => {
    // appliedAt = the most recent week's Monday + 2 days → lands in last bucket
    const now = new Date();
    findMany.mockResolvedValueOnce([{ appliedAt: now }]);
    const result = await getApplicationTrend("u1");
    expect(result[result.length - 1].count).toBe(1);
    const total = result.reduce((s, p) => s + p.count, 0);
    expect(total).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/dashboard/application-trend.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dashboard/application-trend.ts
import { prisma } from "@/lib/db";

export const WEEKS = 10;

export type ApplicationTrendPoint = { weekStart: string; count: number };

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getApplicationTrend(
  userId: string,
): Promise<ApplicationTrendPoint[]> {
  const thisMonday = mondayOf(new Date());
  // Build WEEKS consecutive Monday buckets ending with the current week.
  const buckets: { start: Date; key: string; count: number }[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - i * 7);
    buckets.push({ start, key: ymd(start), count: 0 });
  }
  const since = buckets[0].start;

  const rows = await prisma.application.findMany({
    where: { userId, appliedAt: { not: null, gte: since } },
    select: { appliedAt: true },
  });

  for (const row of rows) {
    if (!row.appliedAt) continue;
    const wkKey = ymd(mondayOf(row.appliedAt));
    const bucket = buckets.find((b) => b.key === wkKey);
    if (bucket) bucket.count++;
  }

  return buckets.map((b) => ({ weekStart: b.key, count: b.count }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/dashboard/application-trend.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/application-trend.ts src/lib/dashboard/application-trend.test.ts
git commit -m "feat(dashboard): add getApplicationTrend (10-week zero-filled)"
```

---

### Task 3: `getInterviewing` + `getSavedNotApplied`

**Files:**
- Create: `src/lib/dashboard/lists.ts`
- Test: `src/lib/dashboard/lists.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dashboard/lists.test.ts
import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { findMany: (...a: any) => findMany(...a) } },
}));

import { getInterviewing, getSavedNotApplied } from "@/lib/dashboard/lists";

const row = (id: string, title: string, company: string, url: string | null = null) => ({
  id,
  updatedAt: new Date("2026-06-09T10:00:00Z"),
  job: { title, company, url, descriptionText: "x" },
});

describe("getInterviewing", () => {
  it("queries status=interviewing, scoped to user, include job, orderBy updatedAt desc, take 8", async () => {
    findMany.mockResolvedValueOnce([row("a1", "SWE", "Acme")]);
    await getInterviewing("u1");
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1", status: "interviewing" });
    expect(args.include).toEqual({ job: true });
    expect(args.orderBy).toEqual({ updatedAt: "desc" });
    expect(args.take).toBe(8);
  });

  it("maps to {id, jobTitle, company, updatedAt}", async () => {
    findMany.mockResolvedValueOnce([row("a1", "SWE", "Acme")]);
    const result = await getInterviewing("u1");
    expect(result[0]).toEqual({
      id: "a1",
      jobTitle: "SWE",
      company: "Acme",
      updatedAt: new Date("2026-06-09T10:00:00Z"),
    });
  });
});

describe("getSavedNotApplied", () => {
  it("queries status=saved, scoped to user, orderBy updatedAt desc, take 8", async () => {
    findMany.mockResolvedValueOnce([row("s1", "PM", "Beta", "https://x.co")]);
    await getSavedNotApplied("u1");
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "u1", status: "saved" });
    expect(args.orderBy).toEqual({ updatedAt: "desc" });
    expect(args.take).toBe(8);
  });

  it("maps to {id, jobTitle, company, url}", async () => {
    findMany.mockResolvedValueOnce([row("s1", "PM", "Beta", "https://x.co")]);
    const result = await getSavedNotApplied("u1");
    expect(result[0]).toEqual({
      id: "s1",
      jobTitle: "PM",
      company: "Beta",
      url: "https://x.co",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/dashboard/lists.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dashboard/lists.ts
import { prisma } from "@/lib/db";

export type InterviewRow = {
  id: string;
  jobTitle: string;
  company: string;
  updatedAt: Date;
};

export type SavedRow = {
  id: string;
  jobTitle: string;
  company: string;
  url: string | null;
};

export async function getInterviewing(
  userId: string,
  limit = 8,
): Promise<InterviewRow[]> {
  const rows = await prisma.application.findMany({
    where: { userId, status: "interviewing" },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    jobTitle: r.job.title,
    company: r.job.company,
    updatedAt: r.updatedAt,
  }));
}

export async function getSavedNotApplied(
  userId: string,
  limit = 8,
): Promise<SavedRow[]> {
  const rows = await prisma.application.findMany({
    where: { userId, status: "saved" },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    jobTitle: r.job.title,
    company: r.job.company,
    url: r.job.url,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/dashboard/lists.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/lists.ts src/lib/dashboard/lists.test.ts
git commit -m "feat(dashboard): add interviewing + saved-not-applied queries"
```

---

### Task 4: `getNewJobs24h` (rolling 24h window)

**Files:**
- Create: `src/lib/dashboard/new-jobs.ts`
- Test: `src/lib/dashboard/new-jobs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dashboard/new-jobs.test.ts
import { describe, it, expect, vi } from "vitest";

const findMany = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/db", () => ({
  prisma: { job: { findMany: (...a: any) => findMany(...a) } },
}));

import { getNewJobs24h } from "@/lib/dashboard/new-jobs";

describe("getNewJobs24h", () => {
  it("filters source=ats and postedAt within the last 24h", async () => {
    const before = Date.now();
    await getNewJobs24h();
    const args = findMany.mock.calls[0][0];
    expect(args.where.source).toBe("ats");
    const gte: Date = args.where.postedAt.gte;
    expect(gte).toBeInstanceOf(Date);
    const expected = before - 24 * 60 * 60 * 1000;
    expect(Math.abs(gte.getTime() - expected)).toBeLessThan(1000);
  });

  it("orders by postedAt desc and defaults take=25", async () => {
    await getNewJobs24h();
    const args = findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ postedAt: "desc" });
    expect(args.take).toBe(25);
  });

  it("honours a custom limit", async () => {
    await getNewJobs24h(5);
    expect(findMany.mock.calls[findMany.mock.calls.length - 1][0].take).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/dashboard/new-jobs.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dashboard/new-jobs.ts
import { prisma } from "@/lib/db";

export async function getNewJobs24h(limit = 25) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.job.findMany({
    where: { source: "ats", postedAt: { gte: since } },
    orderBy: { postedAt: "desc" },
    take: limit,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/dashboard/new-jobs.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/new-jobs.ts src/lib/dashboard/new-jobs.test.ts
git commit -m "feat(dashboard): add getNewJobs24h rolling 24h window"
```

---

### Task 5: Rewrite `getDashboardSummary` under `src/lib/dashboard/`

**Files:**
- Create: `src/lib/dashboard/summary.ts`
- Test: `src/lib/dashboard/summary.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/dashboard/summary.test.ts
import { describe, it, expect, vi } from "vitest";

const groupBy = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { application: { groupBy: (...a: any) => groupBy(...a) } },
}));
vi.mock("@/lib/dashboard/stats", () => ({
  getActivityStats: vi.fn().mockResolvedValue({
    appliedThisWeek: 1, appliedTotal: 2, interviewing: 1, responseRate: 50,
  }),
}));
vi.mock("@/lib/dashboard/application-trend", () => ({
  getApplicationTrend: vi.fn().mockResolvedValue([{ weekStart: "2026-06-08", count: 1 }]),
}));
vi.mock("@/lib/dashboard/new-jobs", () => ({
  getNewJobs24h: vi.fn().mockResolvedValue([{ id: "j1" }]),
}));
vi.mock("@/lib/dashboard/lists", () => ({
  getInterviewing: vi.fn().mockResolvedValue([{ id: "i1" }]),
  getSavedNotApplied: vi.fn().mockResolvedValue([{ id: "s1" }]),
}));
vi.mock("@/lib/health/app-updates", () => ({
  getRecentAppUpdates: vi.fn().mockResolvedValue([{ id: "u1" }]),
}));

import { getDashboardSummary } from "@/lib/dashboard/summary";

describe("getDashboardSummary", () => {
  it("assembles all sections and zero-fills the funnel", async () => {
    groupBy.mockResolvedValueOnce([{ status: "applied", _count: { _all: 3 } }]);
    const s = await getDashboardSummary("u1");

    expect(s.stats.appliedTotal).toBe(2);
    expect(s.applicationTrend).toEqual([{ weekStart: "2026-06-08", count: 1 }]);
    expect(s.newJobs).toEqual([{ id: "j1" }]);
    expect(s.appUpdates).toEqual([{ id: "u1" }]);
    expect(s.interviewing).toEqual([{ id: "i1" }]);
    expect(s.savedNotApplied).toEqual([{ id: "s1" }]);
    expect(s.funnel).toEqual({
      saved: 0, applied: 3, interviewing: 0, offer: 0, rejected: 0,
    });
    expect(groupBy.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("does not expose any health fields", async () => {
    groupBy.mockResolvedValueOnce([]);
    const s = await getDashboardSummary("u1");
    expect(s).not.toHaveProperty("composite");
    expect(s).not.toHaveProperty("components");
    expect(s).not.toHaveProperty("healthTrend");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/dashboard/summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/dashboard/summary.ts
import { prisma } from "@/lib/db";
import { getActivityStats } from "./stats";
import { getApplicationTrend } from "./application-trend";
import { getNewJobs24h } from "./new-jobs";
import { getInterviewing, getSavedNotApplied } from "./lists";
import { getRecentAppUpdates } from "@/lib/health/app-updates";

const STATUSES = ["saved", "applied", "interviewing", "offer", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export async function getDashboardSummary(userId: string) {
  const [stats, applicationTrend, newJobs, appUpdates, interviewing, savedNotApplied, grouped] =
    await Promise.all([
      getActivityStats(userId),
      getApplicationTrend(userId),
      getNewJobs24h(),
      getRecentAppUpdates(userId),
      getInterviewing(userId),
      getSavedNotApplied(userId),
      prisma.application.groupBy({
        by: ["status"],
        where: { userId },
        _count: { _all: true },
      }),
    ]);

  const funnel = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const g of grouped) {
    funnel[g.status as Status] = g._count?._all ?? 0;
  }

  return { stats, applicationTrend, funnel, newJobs, appUpdates, interviewing, savedNotApplied };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/dashboard/summary.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/summary.ts src/lib/dashboard/summary.test.ts
git commit -m "feat(dashboard): rewrite summary around application tracking"
```

---

## PHASE B — Dashboard UI

### Task 6: `ShowMoreButton` + convert New Jobs / Recent Updates to client show-more cards

**Files:**
- Create: `src/components/dashboard/show-more-button.tsx`
- Create: `src/components/dashboard/show-more-button.test.tsx`
- Modify: `src/components/new-jobs-card.tsx`
- Modify: `src/components/app-updates-card.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/show-more-button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";

describe("ShowMoreButton", () => {
  it("shows remaining count when collapsed and toggles label on click", async () => {
    const onToggle = vi.fn();
    render(<ShowMoreButton expanded={false} remaining={6} onToggle={onToggle} />);
    const btn = screen.getByRole("button", { name: /show 6 more/i });
    await userEvent.click(btn);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows 'Show less' when expanded", () => {
    render(<ShowMoreButton expanded={true} remaining={6} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
  });
});
```

Note: `@testing-library/user-event` is already a transitive dep of `@testing-library/react`; if the import fails at runtime, fall back to `fireEvent.click` from `@testing-library/react` and assert on the handler.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/dashboard/show-more-button.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the component**

```tsx
// src/components/dashboard/show-more-button.tsx
"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShowMoreButtonProps {
  expanded: boolean;
  remaining: number;
  onToggle: () => void;
}

export function ShowMoreButton({ expanded, remaining, onToggle }: ShowMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-2 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
    >
      {expanded ? "Show less" : `Show ${remaining} more`}
      <ChevronDown
        className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
      />
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/dashboard/show-more-button.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewrite `new-jobs-card.tsx` as a client show-more card**

```tsx
// src/components/new-jobs-card.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
}

const COLLAPSED = 4;

export function NewJobsCard({ jobs }: { jobs: JobRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? jobs : jobs.slice(0, COLLAPSED);
  const remaining = jobs.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>New Jobs · last 24h</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No new jobs in the last 24 hours.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((job) => (
                <li
                  key={job.id}
                  className="flex items-start justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    {job.url ? (
                      <Link
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline underline-offset-4 truncate block"
                      >
                        {job.title}
                      </Link>
                    ) : (
                      <span className="font-medium truncate block">{job.title}</span>
                    )}
                    <span className="text-muted-foreground truncate block">
                      {job.company}
                      {job.location ? ` · ${job.location}` : ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <ShowMoreButton
                expanded={expanded}
                remaining={remaining}
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
            <Link
              href="/jobs"
              className="mt-2 block text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              View all jobs →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Rewrite `app-updates-card.tsx` as a client show-more card**

```tsx
// src/components/app-updates-card.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@prisma/client";
import type { AppUpdate } from "@/lib/health/app-updates";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";

const STATUS_VARIANT: Record<AppStatus, "default" | "secondary" | "destructive" | "outline"> = {
  offer: "default",
  interviewing: "secondary",
  applied: "secondary",
  saved: "outline",
  rejected: "destructive",
};

const COLLAPSED = 4;

export function AppUpdatesCard({ updates }: { updates: AppUpdate[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? updates : updates.slice(0, COLLAPSED);
  const remaining = updates.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Recent Updates</CardTitle>
      </CardHeader>
      <CardContent>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No recent updates.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((update) => (
                <li
                  key={update.id}
                  className="flex items-center justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{update.job.title}</span>
                    <span className="text-muted-foreground truncate block">
                      {update.job.company}
                    </span>
                  </div>
                  <Badge
                    variant={STATUS_VARIANT[update.status] ?? "outline"}
                    className="shrink-0 capitalize"
                  >
                    {update.status}
                  </Badge>
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <ShowMoreButton
                expanded={expanded}
                remaining={remaining}
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
            <Link
              href="/applications"
              className="mt-2 block text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              View all applications →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Verify build/tests still green**

Run: `pnpm test -- src/components/dashboard/show-more-button.test.tsx`
Expected: PASS. (Card components have no dedicated tests.)

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard/show-more-button.tsx src/components/dashboard/show-more-button.test.tsx src/components/new-jobs-card.tsx src/components/app-updates-card.tsx
git commit -m "feat(dashboard): show-more list cards for jobs + updates"
```

---

### Task 7: `ActivityStatsCard` (stat tiles)

**Files:**
- Create: `src/components/dashboard/activity-stats-card.tsx`

- [ ] **Step 1: Write the component** (no unit test — pure presentational; verified visually in Task 11)

```tsx
// src/components/dashboard/activity-stats-card.tsx
import { Card } from "@/components/ui/card";
import type { ActivityStats } from "@/lib/dashboard/stats";

function Tile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <div className="flex flex-col gap-1 px-(--card-spacing) py-(--card-spacing)">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {accent && <span className="h-1.5 w-1.5 rounded-full bg-highlight" />}
          {label}
        </span>
        <span className="text-2xl font-extrabold tracking-tight tabular-nums">{value}</span>
      </div>
    </Card>
  );
}

export function ActivityStatsCard({ stats }: { stats: ActivityStats }) {
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
      <Tile label="Applied this week" value={stats.appliedThisWeek} accent />
      <Tile label="Applied (all-time)" value={stats.appliedTotal} />
      <Tile label="Interviewing" value={stats.interviewing} />
      <Tile
        label="Response rate"
        value={stats.responseRate === null ? "—" : `${stats.responseRate}%`}
      />
    </div>
  );
}
```

Note: `px-(--card-spacing)` matches the Card primitive's internal padding token (see `src/components/ui/card.tsx`). If that token isn't applied cleanly on a bare `<Card>` without `CardContent`, substitute `p-4`.

- [ ] **Step 2: Typecheck**

Run: `pnpm build` (or rely on Task 11's page build).
Expected: no type errors referencing this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/activity-stats-card.tsx
git commit -m "feat(dashboard): activity stat tiles"
```

---

### Task 8: `ApplicationTrendChart`

**Files:**
- Create: `src/components/dashboard/application-trend-chart.tsx`

- [ ] **Step 1: Write the component** (adapted from the existing `health-trend-chart.tsx` chart treatment)

```tsx
// src/components/dashboard/application-trend-chart.tsx
"use client";

import { useId } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { ApplicationTrendPoint } from "@/lib/dashboard/application-trend";

const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

function shortDate(v: string) {
  const d = new Date(v + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function ApplicationTrendChart({ points }: { points: ApplicationTrendPoint[] }) {
  const gradientId = useId();
  const hasData = points.some((p) => p.count > 0);

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Applications over time</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No applications yet — once you start applying, your weekly momentum shows up here.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="weekStart"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={shortDate}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                width={28}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      "Week of " +
                      new Date(value + "T00:00:00").toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/application-trend-chart.tsx
git commit -m "feat(dashboard): applications-over-time chart"
```

---

### Task 9: `InterviewingCard` + `SavedQueueCard`

**Files:**
- Create: `src/components/dashboard/interviewing-card.tsx`
- Create: `src/components/dashboard/saved-queue-card.tsx`

- [ ] **Step 1: Write `interviewing-card.tsx`**

```tsx
// src/components/dashboard/interviewing-card.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";
import type { InterviewRow } from "@/lib/dashboard/lists";

const COLLAPSED = 4;

function relativeDays(date: Date): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function InterviewingCard({ rows }: { rows: InterviewRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  const remaining = rows.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Interviewing</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No live interview processes right now.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{row.jobTitle}</span>
                    <span className="text-muted-foreground truncate block">{row.company}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {relativeDays(row.updatedAt)}
                  </span>
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <ShowMoreButton
                expanded={expanded}
                remaining={remaining}
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
            <Link
              href="/applications?status=interviewing"
              className="mt-2 block text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              View all →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write `saved-queue-card.tsx`**

```tsx
// src/components/dashboard/saved-queue-card.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";
import type { SavedRow } from "@/lib/dashboard/lists";

const COLLAPSED = 4;

export function SavedQueueCard({ rows }: { rows: SavedRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  const remaining = rows.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Saved · not applied</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Nothing saved waiting on you — nice and clear.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    {row.url ? (
                      <Link
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline underline-offset-4 truncate block"
                      >
                        {row.jobTitle}
                      </Link>
                    ) : (
                      <span className="font-medium truncate block">{row.jobTitle}</span>
                    )}
                    <span className="text-muted-foreground truncate block">{row.company}</span>
                  </div>
                </li>
              ))}
            </ul>
            {remaining > 0 && (
              <ShowMoreButton
                expanded={expanded}
                remaining={remaining}
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
            <Link
              href="/applications?status=saved"
              className="mt-2 block text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              View all →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/interviewing-card.tsx src/components/dashboard/saved-queue-card.tsx
git commit -m "feat(dashboard): interviewing + saved-not-applied cards"
```

---

### Task 10: Clickable funnel + applications `?status=` filter

**Files:**
- Modify: `src/components/funnel-card.tsx`
- Modify: `src/app/(app)/applications/page.tsx`

- [ ] **Step 1: Rewrite `funnel-card.tsx` with stage links**

```tsx
// src/components/funnel-card.tsx
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FUNNEL_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

const FUNNEL_ORDER = ["saved", "applied", "interviewing", "offer", "rejected"] as const;

interface FunnelCardProps {
  funnel: Record<"saved" | "applied" | "interviewing" | "offer" | "rejected", number>;
}

export function FunnelCard({ funnel }: FunnelCardProps) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Application Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {FUNNEL_ORDER.map((status) => (
            <Link
              key={status}
              href={`/applications?status=${status}`}
              className="flex items-center justify-between rounded-md px-2 py-1.5 -mx-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <span className="text-muted-foreground">{FUNNEL_LABELS[status]}</span>
              <span className="font-semibold text-base tabular-nums">{funnel[status]}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add `?status=` filtering to the applications page**

Replace the body of `src/app/(app)/applications/page.tsx` with:

```tsx
import { Prisma, type AppStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApplicationsTable } from "@/components/applications-table";
import { AddJobDialog } from "@/components/add-job-dialog";

export const dynamic = "force-dynamic";

export type AppWithJob = Prisma.ApplicationGetPayload<{ include: { job: true } }>;

const VALID_STATUSES: AppStatus[] = [
  "saved",
  "applied",
  "interviewing",
  "offer",
  "rejected",
];

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const statusFilter =
    status && VALID_STATUSES.includes(status as AppStatus)
      ? (status as AppStatus)
      : undefined;

  const apps = await prisma.application.findMany({
    where: { userId: user.id, ...(statusFilter ? { status: statusFilter } : {}) },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Tracker</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">
            Every role you&apos;re chasing — in one place that beats a spreadsheet.
          </p>
        </div>
        <AddJobDialog />
      </div>
      <ApplicationsTable applications={apps} />
    </div>
  );
}
```

Note on Next.js 16: `searchParams` is an async prop (a Promise) and must be awaited — confirm against `node_modules/next/dist/docs/` if the build complains.

- [ ] **Step 3: Build to verify types + async searchParams**

Run: `pnpm build`
Expected: compiles; `/applications` and `/dashboard` routes build without type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/funnel-card.tsx "src/app/(app)/applications/page.tsx"
git commit -m "feat(dashboard): clickable funnel + applications status filter"
```

---

### Task 11: Rebuild the dashboard page + remove health components

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- Modify: `src/app/(app)/dashboard/loading.tsx`
- Delete: `src/components/health-card.tsx`, `src/components/health-trend-chart.tsx`

- [ ] **Step 1: Rewrite the dashboard page**

```tsx
// src/app/(app)/dashboard/page.tsx
import { requireUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard/summary";
import { ActivityStatsCard } from "@/components/dashboard/activity-stats-card";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { InterviewingCard } from "@/components/dashboard/interviewing-card";
import { SavedQueueCard } from "@/components/dashboard/saved-queue-card";
import { FunnelCard } from "@/components/funnel-card";
import { NewJobsCard } from "@/components/new-jobs-card";
import { AppUpdatesCard } from "@/components/app-updates-card";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const summary = await getDashboardSummary(user.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Dashboard</p>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Welcome back, {user.name ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">Your job search at a glance.</p>
      </div>

      <ActivityStatsCard stats={summary.stats} />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="md:col-span-2">
          <ApplicationTrendChart points={summary.applicationTrend} />
        </div>
        <FunnelCard funnel={summary.funnel} />

        <NewJobsCard
          jobs={summary.newJobs.map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            url: j.url,
          }))}
        />
        <AppUpdatesCard updates={summary.appUpdates} />
        <InterviewingCard rows={summary.interviewing} />
        <SavedQueueCard rows={summary.savedNotApplied} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `loading.tsx` to match the new layout**

Read the current `src/app/(app)/dashboard/loading.tsx` first, then replace its card skeleton grid so it mirrors: a 4-tile stats row + a `md:grid-cols-2 xl:grid-cols-3` card grid. Use the existing `Skeleton` primitive already imported there. Minimal version:

```tsx
// src/app/(app)/dashboard/loading.tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-[260px] rounded-xl md:col-span-2" />
        <Skeleton className="h-[260px] rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    </div>
  );
}
```

(If the existing `loading.tsx` differs in import path for `Skeleton`, keep its import.)

- [ ] **Step 3: Confirm health components are unused, then delete them**

Run: `grep -rn "HealthCard\|HealthTrendChart\|health-card\|health-trend-chart" src/ | grep -v "\.test\."`
Expected: no matches outside the two component files themselves. Then:

```bash
git rm src/components/health-card.tsx src/components/health-trend-chart.tsx
```

If `grep` shows any *other* importer, stop and leave the files; revisit the spec.

- [ ] **Step 4: Build + full test run**

Run: `pnpm build && pnpm test`
Expected: build succeeds; all tests pass (the deleted `src/lib/health/summary.ts` is no longer imported anywhere — if a test references it, delete that stale test; `summary.ts` under health may be removed in Step 5).

- [ ] **Step 5: Remove the now-orphaned `src/lib/health/summary.ts`**

Run: `grep -rn "health/summary\|getDashboardSummary" src/ | grep -v "lib/dashboard"`
Expected: only the old file. If nothing else imports `@/lib/health/summary`, delete it:

```bash
git rm src/lib/health/summary.ts
```

Leave `src/lib/health/{composite,snapshot,health-trend,app-updates}.ts` and their tests intact (still used by profile / imported by the new summary).

- [ ] **Step 6: Build + test once more**

Run: `pnpm build && pnpm test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(dashboard): rebuild around application tracking; drop profile health"
```

---

## PHASE C — Landing page

### Task 12: Landing scaffolding — reveal wrapper, nav, and auth redirect

**Files:**
- Create: `src/components/landing/reveal.tsx`
- Create: `src/components/landing/landing-nav.tsx`
- Modify: `src/app/page.tsx` (interim: redirect + nav + hero placeholder)

- [ ] **Step 1: Create the reduced-motion-aware reveal wrapper**

```tsx
// src/components/landing/reveal.tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

Note: `motion@12.40.0` is installed and exposes the `motion/react` subpath (confirmed during planning), which provides both `motion` and `useReducedMotion`.

- [ ] **Step 2: Create the nav**

```tsx
// src/components/landing/landing-nav.tsx
import { signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-base font-extrabold text-primary-foreground">
            H
          </span>
          <span className="text-lg font-extrabold tracking-tight">Hone</span>
          <span className="h-1.5 w-1.5 rounded-full bg-highlight" />
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <form action={signInWithGoogle}>
          <Button type="submit" size="sm">Sign in</Button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Wire the redirect + nav into the page (interim)**

```tsx
// src/app/page.tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingNav } from "@/components/landing/landing-nav";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <div id="top" className="flex min-h-screen flex-col bg-background">
      <LandingNav />
      <main className="flex-1">
        <p className="mx-auto max-w-6xl px-6 py-24 text-muted-foreground">
          Landing sections go here.
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Manual verify**

Run the dev server (`pnpm dev`) — visit `/` while **logged out**: nav + placeholder render. While **logged in**: redirected to `/dashboard`. (If you can't auth locally, at least confirm `pnpm build` compiles.)

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/reveal.tsx src/components/landing/landing-nav.tsx src/app/page.tsx
git commit -m "feat(landing): nav, reveal wrapper, auth redirect"
```

---

### Task 13: Hero + app-preview mock

**Files:**
- Create: `src/components/landing/app-preview.tsx`
- Create: `src/components/landing/hero.tsx`

- [ ] **Step 1: Build the faux app-preview mock**

```tsx
// src/components/landing/app-preview.tsx
// Static, token-built representation of the dashboard — no screenshot dependency.
export function AppPreview() {
  const tiles = [
    { label: "Applied this week", value: "7" },
    { label: "Applied", value: "42" },
    { label: "Interviewing", value: "3" },
    { label: "Response rate", value: "31%" },
  ];
  const funnel = [
    { label: "Saved", v: 12, w: "w-full" },
    { label: "Applied", v: 42, w: "w-4/5" },
    { label: "Interviewing", v: 3, w: "w-2/5" },
    { label: "Offer", v: 1, w: "w-1/5" },
  ];

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-xl shadow-primary/5 ring-1 ring-foreground/5">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-highlight/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />
        <span className="ml-2 text-xs font-medium text-muted-foreground">hone · dashboard</span>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-muted/60 p-3">
            <p className="truncate text-[10px] font-medium text-muted-foreground">{t.label}</p>
            <p className="text-lg font-extrabold tracking-tight">{t.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="col-span-2 rounded-lg bg-muted/60 p-3">
          <p className="mb-2 text-[10px] font-medium text-muted-foreground">Applications over time</p>
          <svg viewBox="0 0 200 60" className="h-16 w-full" preserveAspectRatio="none">
            <polyline
              points="0,50 30,42 60,46 90,30 120,34 150,18 200,12"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
          </svg>
        </div>
        <div className="rounded-lg bg-muted/60 p-3">
          <p className="mb-2 text-[10px] font-medium text-muted-foreground">Funnel</p>
          <div className="space-y-1.5">
            {funnel.map((f) => (
              <div key={f.label} className="flex items-center gap-2">
                <div className={`h-2 rounded-full bg-primary/70 ${f.w}`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build the hero**

```tsx
// src/components/landing/hero.tsx
import { signInWithGoogle } from "@/app/actions/auth";
import { Button, buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";
import { AppPreview } from "@/components/landing/app-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* violet glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <Reveal>
          <p className="text-sm font-semibold text-primary">Your job search, organized</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mx-auto mt-3 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Land your next role,{" "}
            <span className="relative whitespace-nowrap">
              sharper
              <span className="absolute inset-x-0 -bottom-1 h-3 -z-10 bg-highlight/70" />
            </span>
            .
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Track every application, catch fresh jobs daily, and hone your resume —
            all in one place that beats a spreadsheet.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <form action={signInWithGoogle}>
              <Button type="submit" size="lg">Get started →</Button>
            </form>
            <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See how it works
            </a>
          </div>
        </Reveal>
        <Reveal delay={0.2} className="mt-14">
          <div className="mx-auto max-w-3xl">
            <AppPreview />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
```

Note: the base-ui `Button` does not support `asChild` (it exposes a `render` prop) — confirmed during planning. The secondary CTA is therefore a plain `<a>` styled with `buttonVariants(...)`, as shown above.

- [ ] **Step 3: Render Hero in `page.tsx` (replace placeholder `<main>` body with `<Hero />`)**

```tsx
// in src/app/page.tsx — replace the <main> contents
<main className="flex-1">
  <Hero />
</main>
```

(Add `import { Hero } from "@/components/landing/hero";`.)

- [ ] **Step 4: Build + eyeball**

Run: `pnpm build`. Then dev-server check `/` logged out: hero + preview render, CTA submits, "See how it works" anchors.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/app-preview.tsx src/components/landing/hero.tsx src/app/page.tsx
git commit -m "feat(landing): hero + app-preview mock"
```

---

### Task 14: Feature grid + how-it-works

**Files:**
- Create: `src/components/landing/feature-grid.tsx`
- Create: `src/components/landing/how-it-works.tsx`

- [ ] **Step 1: Feature grid**

```tsx
// src/components/landing/feature-grid.tsx
import { ClipboardList, CalendarClock, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/landing/reveal";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Track every application",
    body: "A pipeline that beats a spreadsheet — saved, applied, interviewing, offer.",
  },
  {
    icon: CalendarClock,
    title: "Fresh jobs, every 24 hours",
    body: "Early-career roles surfaced daily, so you never miss a new posting.",
  },
  {
    icon: Sparkles,
    title: "Hone your resume",
    body: "Resume, LinkedIn, and site analysis plus job-match scoring.",
  },
  {
    icon: TrendingUp,
    title: "See your momentum",
    body: "Activity stats and applications-over-time, at a glance.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20">
      <Reveal>
        <p className="text-center text-sm font-semibold text-primary">Everything in one place</p>
        <h2 className="mx-auto mt-2 max-w-2xl text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
          The whole job search, without the chaos
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.05}>
            <Card className="h-full p-(--card-spacing) hover:shadow-sm transition-shadow">
              <div className="flex flex-col gap-3 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="font-bold tracking-tight">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
```

Note: if `p-(--card-spacing)` double-pads with the inner `p-5`, drop the outer `p-(--card-spacing)` and keep `p-5`.

- [ ] **Step 2: How it works**

```tsx
// src/components/landing/how-it-works.tsx
import { Reveal } from "@/components/landing/reveal";

const STEPS = [
  { n: "1", title: "Sign in with Google", body: "No setup. You're in and tracking in seconds." },
  { n: "2", title: "Save & track roles", body: "Add jobs from the daily feed or paste your own." },
  { n: "3", title: "Stay on top of every stage", body: "Move roles through your pipeline and never lose the thread." },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-border/60 bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="text-center text-sm font-semibold text-primary">How it works</p>
          <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            Three steps to a calmer search
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="flex flex-col items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-extrabold text-primary-foreground">
                  {s.n}
                </span>
                <h3 className="text-lg font-bold tracking-tight">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add both to `page.tsx`** (after `<Hero />`): `<FeatureGrid />` then `<HowItWorks />`, with imports.

- [ ] **Step 4: Build + commit**

```bash
pnpm build
git add src/components/landing/feature-grid.tsx src/components/landing/how-it-works.tsx src/app/page.tsx
git commit -m "feat(landing): feature grid + how-it-works"
```

---

### Task 15: Stats band + FAQ + footer

**Files:**
- Create: `src/components/landing/stats-band.tsx`
- Create: `src/components/landing/faq.tsx`
- Create: `src/components/landing/landing-footer.tsx`

- [ ] **Step 1: Stats band (honest, feature-based — no fabricated user counts)**

```tsx
// src/components/landing/stats-band.tsx
import { Reveal } from "@/components/landing/reveal";

const STATS = [
  { value: "5", label: "pipeline stages, end to end" },
  { value: "24h", label: "fresh jobs, every single day" },
  { value: "1", label: "home for your whole search" },
];

export function StatsBand() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <Reveal>
        <div className="grid gap-8 rounded-2xl bg-primary/5 px-8 py-10 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-4xl font-extrabold tracking-tight text-primary">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
```

- [ ] **Step 2: FAQ (reuse the accordion primitive)**

```tsx
// src/components/landing/faq.tsx
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { Reveal } from "@/components/landing/reveal";

const FAQS = [
  {
    q: "Is Hone free?",
    a: "Yes — sign in with Google and start tracking your applications right away.",
  },
  {
    q: "How do jobs get added?",
    a: "Hone surfaces fresh early-career roles every 24 hours. You can also paste any job to track it.",
  },
  {
    q: "Is my data private?",
    a: "Your applications and profile are tied to your account and only visible to you.",
  },
  {
    q: "What roles are covered?",
    a: "The daily feed focuses on software and early-career tech roles across the US and remote.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-20">
      <Reveal>
        <p className="text-center text-sm font-semibold text-primary">FAQ</p>
        <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
          Questions, answered
        </h2>
      </Reveal>
      <Reveal delay={0.05} className="mt-10">
        <Accordion>
          {FAQS.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger>{item.q}</AccordionTrigger>
              <AccordionContent>{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}
```

Note: confirmed during planning — the base-ui `Accordion` (`AccordionPrimitive.Root`) needs no `value`/`defaultValue` on the root (multiple panels may open), and each `AccordionItem` accepts an optional `value` (here the question string). The markup above matches the primitive's signature.

- [ ] **Step 3: Footer with closing CTA**

```tsx
// src/components/landing/landing-footer.tsx
import { signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";

export function LandingFooter() {
  return (
    <footer>
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-highlight/30 blur-3xl"
            />
            <h2 className="mx-auto max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">
              Ready to hone your search?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-primary-foreground/80">
              Sign in and turn your job hunt into a system that actually works.
            </p>
            <form action={signInWithGoogle} className="mt-8 flex justify-center">
              <Button type="submit" size="lg" variant="secondary">
                Get started →
              </Button>
            </form>
          </div>
        </Reveal>
      </section>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 font-extrabold tracking-tight text-foreground">
            Hone <span className="h-1.5 w-1.5 rounded-full bg-highlight" />
          </span>
          <span>© 2026 Hone. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Compose the full page**

Final `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingNav } from "@/components/landing/landing-nav";
import { Hero } from "@/components/landing/hero";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { HowItWorks } from "@/components/landing/how-it-works";
import { StatsBand } from "@/components/landing/stats-band";
import { Faq } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/landing-footer";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <div id="top" className="flex min-h-screen flex-col bg-background">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <HowItWorks />
        <StatsBand />
        <Faq />
      </main>
      <LandingFooter />
    </div>
  );
}
```

- [ ] **Step 5: Build + full test run**

Run: `pnpm build && pnpm test`
Expected: build succeeds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/stats-band.tsx src/components/landing/faq.tsx src/components/landing/landing-footer.tsx src/app/page.tsx
git commit -m "feat(landing): stats band, FAQ, footer + full page compose"
```

---

### Task 16: Final verification pass

- [ ] **Step 1: Full build + tests**

Run: `pnpm build && pnpm test`
Expected: clean build, all green.

- [ ] **Step 2: Manual smoke (dev server, `pnpm dev` on port 3050)**

Verify, using seed data (`scripts/seed/`, `scripts/seed-applications.ts`) if available:
- `/` logged out → full landing renders; nav anchors scroll; both "Get started" CTAs trigger Google sign-in; FAQ expands.
- `/` logged in → redirects to `/dashboard`.
- `/dashboard` → 4 stat tiles, applications-over-time chart (or empty state), funnel, New Jobs (last 24h), Recent Updates, Interviewing, Saved·not-applied. Show-more expands/collapses where >4 items.
- Click a funnel stage → lands on `/applications?status=<stage>` showing only that status.
- No resume/profile health card anywhere on the dashboard.

- [ ] **Step 3: Lint (if configured)**

Run: `pnpm lint` if the script exists (check `package.json`); fix any new warnings in touched files.

- [ ] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore: final verification for dashboard + landing redesign"
```

---

## Self-Review notes (author)

- **Spec coverage:** stats (Task 1/7), application time-series chart (Task 2/8), interviewing + saved-not-applied (Task 3/9), 24h jobs (Task 4/6), show-more on jobs+updates (Task 6), clickable funnel + status filter (Task 10), health removal (Task 11), landing redirect + all 8 sections (Tasks 12–15). ✔ all spec sections mapped.
- **Type consistency:** `ActivityStats`, `ApplicationTrendPoint`, `InterviewRow`, `SavedRow`, `AppUpdate` are defined once and imported by their consumers; `getDashboardSummary` return keys (`stats`, `applicationTrend`, `funnel`, `newJobs`, `appUpdates`, `interviewing`, `savedNotApplied`) match the dashboard page usage. ✔
- **Open verifications flagged inline:** base-ui `Button asChild`, `Accordion` item API, `motion` import subpath, Next 16 async `searchParams`, and the `--card-spacing` padding token — each has a fallback noted so the engineer isn't blocked.
