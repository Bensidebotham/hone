# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `/analytics` page with Personal (your job-search funnel/conversion/time-in-stage/momentum) and Market (sourced-corpus job volume/salary/tech/remote) tabs.

**Architecture:** On-demand server aggregation. A server component fetches two typed aggregate bundles (`getPersonalAnalytics`, `getMarketAnalytics`) and hands them to a client tab switcher rendering presentational `recharts` components. The lib layer is the only DB touch-point; all queries return small aggregates (`groupBy`, `count`, raw `GROUP BY`) — never row dumps, never descriptions (egress discipline).

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Neon adapter), recharts 3.8, shadcn `ui/chart` + `ui/tabs` + `ui/card`, vitest.

---

## Design decisions locked in

- **DRY reuse:** "Activity over time" reuses the existing `getApplicationTrend` (`src/lib/dashboard/application-trend.ts`) and `ApplicationTrendChart` component verbatim — no new lib/component for it.
- **Funnel semantics (current-status, documented limitation):** stages are cumulative over *current* `Application.status`. `applied = status ∈ {applied,interviewing,offer,rejected}`, `interviewing = status ∈ {interviewing,offer}`, `offer = status = offer`, `rejected = status = rejected` (shown as leakage). An app currently `rejected` that previously interviewed is not counted at the interview stage — the funnel component shows a one-line footnote stating this.
- **Market corpus = global jobs:** `Job.userId IS NULL` (aggregator/ATS ingest with no user). Paste jobs (user-owned) are excluded.
- **Honest labels:** Market header subtitle says "From your sourced job feed (new-grad / internship + ATS lists)."
- **BigInt:** raw `count(*)` returns `BigInt`; every raw count is wrapped in `Number()`.

---

## File structure

```
src/lib/analytics/
  ├─ types.ts        # all result types (Task 1)
  ├─ personal.ts     # getPersonalAnalytics (Tasks 2-4)
  ├─ personal.test.ts
  ├─ market.ts       # getMarketAnalytics (Task 5)
  └─ market.test.ts
src/components/analytics/
  ├─ funnel-chart.tsx        # Task 6
  ├─ conversion-stats.tsx    # Task 6
  ├─ time-in-stage.tsx       # Task 6
  ├─ funnel-chart.test.tsx   # Task 6
  ├─ job-volume-chart.tsx    # Task 7
  ├─ salary-histogram.tsx    # Task 7
  ├─ tech-demand-chart.tsx   # Task 7
  ├─ remote-split.tsx        # Task 7
  └─ analytics-tabs.tsx      # Task 8 (client tab switcher)
src/app/(app)/analytics/page.tsx   # Task 8
src/components/app-nav.tsx          # Task 8 (add nav link)
```

---

### Task 1: Shared types

**Files:**
- Create: `src/lib/analytics/types.ts`

- [ ] **Step 1: Write the types**

```ts
// src/lib/analytics/types.ts

export type Funnel = {
  applied: number;
  interviewing: number;
  offer: number;
  rejected: number;
};

export type Conversion = {
  // null when the denominator is 0
  appliedToInterview: number | null; // percent 0-100
  interviewToOffer: number | null; // percent 0-100
};

export type TimeInStage = {
  appliedToResponseDays: number | null; // median; null when n < 3
  appliedToResponseN: number;
  interviewToDecisionDays: number | null;
  interviewToDecisionN: number;
};

export type PersonalAnalytics = {
  funnel: Funnel;
  conversion: Conversion;
  timeInStage: TimeInStage;
};

export type WeeklyPoint = { weekStart: string; count: number };
export type SalaryBucket = { label: string; count: number };
export type TechCount = { tag: string; count: number };

export type MarketAnalytics = {
  jobVolume: WeeklyPoint[];
  salary: { buckets: SalaryBucket[]; coveragePct: number | null }; // coverage = % of jobs listing salary
  topTech: TechCount[];
  remote: { remote: number; onsite: number };
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no errors introduced).

- [ ] **Step 3: Commit**

```bash
git add src/lib/analytics/types.ts
git commit -m "feat(analytics): shared result types"
```

---

### Task 2: Personal funnel + conversion

**Files:**
- Create: `src/lib/analytics/personal.ts`
- Test: `src/lib/analytics/personal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics/personal.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    application: { groupBy: (...a: any) => groupBy(...a) },
    applicationEvent: { findMany: (...a: any) => findMany(...a) },
  },
}));

import { getFunnel, getConversion } from "@/lib/analytics/personal";

describe("getFunnel", () => {
  beforeEach(() => {
    groupBy.mockReset();
    // status groupBy result for the user
    groupBy.mockResolvedValue([
      { status: "saved", _count: { _all: 5 } },
      { status: "applied", _count: { _all: 10 } },
      { status: "interviewing", _count: { _all: 3 } },
      { status: "offer", _count: { _all: 1 } },
      { status: "rejected", _count: { _all: 4 } },
    ]);
  });

  it("scopes the groupBy to the user", async () => {
    await getFunnel("u1");
    expect(groupBy.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("computes cumulative funnel stages excluding saved from applied", async () => {
    const f = await getFunnel("u1");
    // applied = applied+interviewing+offer+rejected = 18
    // interviewing = interviewing+offer = 4
    expect(f).toEqual({ applied: 18, interviewing: 4, offer: 1, rejected: 4 });
  });

  it("returns all-zero funnel when there are no applications", async () => {
    groupBy.mockResolvedValue([]);
    const f = await getFunnel("u1");
    expect(f).toEqual({ applied: 0, interviewing: 0, offer: 0, rejected: 0 });
  });
});

describe("getConversion", () => {
  it("computes percentages from funnel counts", () => {
    const c = getConversion({ applied: 18, interviewing: 4, offer: 1, rejected: 4 });
    expect(c.appliedToInterview).toBe(22); // round(4/18*100)
    expect(c.interviewToOffer).toBe(25); // round(1/4*100)
  });

  it("returns null for a stage with a zero denominator", () => {
    const c = getConversion({ applied: 0, interviewing: 0, offer: 0, rejected: 0 });
    expect(c.appliedToInterview).toBeNull();
    expect(c.interviewToOffer).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/personal.test.ts`
Expected: FAIL — "getFunnel is not a function" / module has no export.

- [ ] **Step 3: Implement funnel + conversion**

```ts
// src/lib/analytics/personal.ts
import { prisma } from "@/lib/db";
import type { Funnel, Conversion } from "./types";

export async function getFunnel(userId: string): Promise<Funnel> {
  const rows = await prisma.application.groupBy({
    by: ["status"],
    where: { userId },
    _count: { _all: true },
  });
  const by = (s: string) =>
    rows.find((r) => r.status === s)?._count._all ?? 0;
  const applied =
    by("applied") + by("interviewing") + by("offer") + by("rejected");
  const interviewing = by("interviewing") + by("offer");
  return { applied, interviewing, offer: by("offer"), rejected: by("rejected") };
}

function pct(num: number, denom: number): number | null {
  if (denom === 0) return null;
  return Math.round((num / denom) * 100);
}

export function getConversion(funnel: Funnel): Conversion {
  return {
    appliedToInterview: pct(funnel.interviewing, funnel.applied),
    interviewToOffer: pct(funnel.offer, funnel.interviewing),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/personal.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/personal.ts src/lib/analytics/personal.test.ts
git commit -m "feat(analytics): personal funnel + conversion"
```

---

### Task 3: Personal time-in-stage

**Files:**
- Modify: `src/lib/analytics/personal.ts`
- Test: `src/lib/analytics/personal.test.ts`

Computation, from `ApplicationEvent` rows of `type: status_change` (small, user-scoped metadata — ids/timestamps/statuses only):
- Group events by `applicationId`.
- **applied→response:** per app, `appliedAt = earliest event with toStatus = "applied"`, `responseAt = earliest event with fromStatus = "applied"`. Duration (days) when both exist and `responseAt >= appliedAt`.
- **interview→decision:** per app, `interviewAt = earliest event with toStatus = "interviewing"`, `decisionAt = earliest event with fromStatus = "interviewing" AND toStatus ∈ {offer, rejected}`. Duration when both exist and ordered.
- Result is the **median** of each cohort; `n` = cohort size; days `null` when `n < 3`.

- [ ] **Step 1: Add the failing test (append to personal.test.ts)**

```ts
import { getTimeInStage, median } from "@/lib/analytics/personal";

describe("median", () => {
  it("returns the middle of an odd-length sorted set", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middle values for even length", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("returns null for empty input", () => {
    expect(median([])).toBeNull();
  });
});

describe("getTimeInStage", () => {
  beforeEach(() => findMany.mockReset());

  const ev = (
    applicationId: string,
    fromStatus: string | null,
    toStatus: string | null,
    iso: string,
  ) => ({ applicationId, fromStatus, toStatus, createdAt: new Date(iso) });

  it("scopes to user + status_change events", async () => {
    findMany.mockResolvedValue([]);
    await getTimeInStage("u1");
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.userId).toBe("u1");
    expect(arg.where.type).toBe("status_change");
  });

  it("computes median applied->response and interview->decision in days", async () => {
    findMany.mockResolvedValue([
      // app a: applied day 0, response (interviewing) day 2  -> 2d
      ev("a", null, "applied", "2026-01-01T00:00:00Z"),
      ev("a", "applied", "interviewing", "2026-01-03T00:00:00Z"),
      // app b: applied day 0, response day 4 -> 4d
      ev("b", null, "applied", "2026-01-01T00:00:00Z"),
      ev("b", "applied", "rejected", "2026-01-05T00:00:00Z"),
      // app c: applied day 0, response day 6 -> 6d
      ev("c", null, "applied", "2026-01-01T00:00:00Z"),
      ev("c", "applied", "interviewing", "2026-01-07T00:00:00Z"),
      // app c also interview day 6 -> offer day 8 -> 2d decision
      ev("c", "interviewing", "offer", "2026-01-09T00:00:00Z"),
    ]);
    const t = await getTimeInStage("u1");
    expect(t.appliedToResponseN).toBe(3);
    expect(t.appliedToResponseDays).toBe(4); // median(2,4,6)
    expect(t.interviewToDecisionN).toBe(1);
    expect(t.interviewToDecisionDays).toBeNull(); // n < 3
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/personal.test.ts`
Expected: FAIL — `getTimeInStage` / `median` not exported.

- [ ] **Step 3: Implement (append to personal.ts)**

```ts
import type { TimeInStage } from "./types";

const DAY_MS = 1000 * 60 * 60 * 24;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Evt = {
  applicationId: string;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: Date;
};

function earliest(events: Evt[], pred: (e: Evt) => boolean): Date | null {
  const hits = events.filter(pred).map((e) => e.createdAt.getTime());
  return hits.length ? new Date(Math.min(...hits)) : null;
}

export async function getTimeInStage(userId: string): Promise<TimeInStage> {
  const events = (await prisma.applicationEvent.findMany({
    where: { userId, type: "status_change" },
    select: { applicationId: true, fromStatus: true, toStatus: true, createdAt: true },
  })) as Evt[];

  const byApp = new Map<string, Evt[]>();
  for (const e of events) {
    const list = byApp.get(e.applicationId) ?? [];
    list.push(e);
    byApp.set(e.applicationId, list);
  }

  const response: number[] = [];
  const decision: number[] = [];
  for (const evs of byApp.values()) {
    const appliedAt = earliest(evs, (e) => e.toStatus === "applied");
    const responseAt = earliest(evs, (e) => e.fromStatus === "applied");
    if (appliedAt && responseAt && responseAt >= appliedAt) {
      response.push((responseAt.getTime() - appliedAt.getTime()) / DAY_MS);
    }
    const interviewAt = earliest(evs, (e) => e.toStatus === "interviewing");
    const decisionAt = earliest(
      evs,
      (e) =>
        e.fromStatus === "interviewing" &&
        (e.toStatus === "offer" || e.toStatus === "rejected"),
    );
    if (interviewAt && decisionAt && decisionAt >= interviewAt) {
      decision.push((decisionAt.getTime() - interviewAt.getTime()) / DAY_MS);
    }
  }

  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return {
    appliedToResponseN: response.length,
    appliedToResponseDays: response.length >= 3 ? round(median(response)) : null,
    interviewToDecisionN: decision.length,
    interviewToDecisionDays: decision.length >= 3 ? round(median(decision)) : null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/personal.test.ts`
Expected: PASS (all personal tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/personal.ts src/lib/analytics/personal.test.ts
git commit -m "feat(analytics): personal time-in-stage (median, n>=3 guard)"
```

---

### Task 4: Assemble `getPersonalAnalytics`

**Files:**
- Modify: `src/lib/analytics/personal.ts`
- Test: `src/lib/analytics/personal.test.ts`

- [ ] **Step 1: Add the failing test (append)**

```ts
import { getPersonalAnalytics } from "@/lib/analytics/personal";

describe("getPersonalAnalytics", () => {
  it("bundles funnel, conversion, and time-in-stage", async () => {
    groupBy.mockResolvedValue([
      { status: "applied", _count: { _all: 8 } },
      { status: "interviewing", _count: { _all: 2 } },
    ]);
    findMany.mockResolvedValue([]);
    const a = await getPersonalAnalytics("u1");
    expect(a.funnel.applied).toBe(10); // 8 + 2
    expect(a.funnel.interviewing).toBe(2);
    expect(a.conversion.appliedToInterview).toBe(20);
    expect(a.timeInStage.appliedToResponseN).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/personal.test.ts`
Expected: FAIL — `getPersonalAnalytics` not exported.

- [ ] **Step 3: Implement (append)**

```ts
import type { PersonalAnalytics } from "./types";

export async function getPersonalAnalytics(
  userId: string,
): Promise<PersonalAnalytics> {
  const [funnel, timeInStage] = await Promise.all([
    getFunnel(userId),
    getTimeInStage(userId),
  ]);
  return { funnel, conversion: getConversion(funnel), timeInStage };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/personal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/personal.ts src/lib/analytics/personal.test.ts
git commit -m "feat(analytics): assemble getPersonalAnalytics"
```

---

### Task 5: Market analytics

**Files:**
- Create: `src/lib/analytics/market.ts`
- Test: `src/lib/analytics/market.test.ts`

Queries (all scoped to the global corpus, `userId IS NULL`):
- **jobVolume:** raw `GROUP BY date_trunc('week', coalesce(postedAt, createdAt))` over the last 12 weeks; JS zero-fills 12 contiguous Monday buckets.
- **salary:** raw `CASE` bucket of midpoint `(salaryMin + coalesce(salaryMax, salaryMin))/2` where `salaryMin IS NOT NULL` and `active`; coverage = jobs-with-salary / active jobs.
- **topTech:** raw `unnest(techTags)` frequency, top 12, where `active`.
- **remote:** `groupBy(isRemote)` where `active`.

The `mondayOf`/`ymd` week helpers mirror `src/lib/dashboard/application-trend.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/analytics/market.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryRaw = vi.fn();
const groupBy = vi.fn();
const count = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    $queryRaw: (...a: any) => queryRaw(...a),
    job: {
      groupBy: (...a: any) => groupBy(...a),
      count: (...a: any) => count(...a),
    },
  },
}));

import { fillWeeks, getRemoteSplit } from "@/lib/analytics/market";

describe("fillWeeks", () => {
  it("produces 12 contiguous Monday buckets, zero-filled, oldest first", () => {
    const out = fillWeeks([], 12);
    expect(out).toHaveLength(12);
    // each weekStart is a Monday (yyyy-mm-dd)
    for (const p of out) {
      expect(new Date(p.weekStart + "T00:00:00").getDay()).toBe(1);
      expect(p.count).toBe(0);
    }
    // ascending
    expect(out[0].weekStart < out[11].weekStart).toBe(true);
  });

  it("maps raw rows onto the matching week bucket", () => {
    const all = fillWeeks([], 12);
    const wk = all[5].weekStart;
    const out = fillWeeks([{ week: new Date(wk + "T00:00:00"), count: 7n }], 12);
    expect(out[5].count).toBe(7); // BigInt coerced to number
  });
});

describe("getRemoteSplit", () => {
  beforeEach(() => groupBy.mockReset());
  it("splits active global jobs by isRemote", async () => {
    groupBy.mockResolvedValue([
      { isRemote: true, _count: { _all: 4 } },
      { isRemote: false, _count: { _all: 6 } },
    ]);
    const r = await getRemoteSplit();
    expect(r).toEqual({ remote: 4, onsite: 6 });
    const where = groupBy.mock.calls[0][0].where;
    expect(where.userId).toBeNull();
    expect(where.active).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/lib/analytics/market.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement market.ts**

```ts
// src/lib/analytics/market.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type {
  MarketAnalytics,
  WeeklyPoint,
  SalaryBucket,
  TechCount,
} from "./types";

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type RawWeek = { week: Date; count: bigint };

/** Build `weeks` contiguous Monday buckets (oldest first) and map raw counts on. */
export function fillWeeks(rows: RawWeek[], weeks: number): WeeklyPoint[] {
  const thisMonday = mondayOf(new Date());
  const buckets: WeeklyPoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = new Date(thisMonday);
    start.setDate(start.getDate() - (weeks - 1 - i) * 7);
    buckets.push({ weekStart: ymd(start), count: 0 });
  }
  for (const row of rows) {
    const key = ymd(mondayOf(new Date(row.week)));
    const b = buckets.find((x) => x.weekStart === key);
    if (b) b.count += Number(row.count);
  }
  return buckets;
}

export async function getJobVolume(weeks = 12): Promise<WeeklyPoint[]> {
  const since = mondayOf(new Date());
  since.setDate(since.getDate() - (weeks - 1) * 7);
  const rows = await prisma.$queryRaw<RawWeek[]>(Prisma.sql`
    SELECT date_trunc('week', COALESCE("postedAt", "createdAt")) AS week,
           count(*) AS count
    FROM "Job"
    WHERE "userId" IS NULL
      AND COALESCE("postedAt", "createdAt") >= ${since}
    GROUP BY 1
  `);
  return fillWeeks(rows, weeks);
}

export async function getSalary(): Promise<MarketAnalytics["salary"]> {
  const rows = await prisma.$queryRaw<{ label: string; count: bigint }[]>(Prisma.sql`
    SELECT CASE
      WHEN mid < 50000  THEN '<50k'
      WHEN mid < 80000  THEN '50-80k'
      WHEN mid < 110000 THEN '80-110k'
      WHEN mid < 140000 THEN '110-140k'
      WHEN mid < 180000 THEN '140-180k'
      ELSE '180k+'
    END AS label, count(*) AS count
    FROM (
      SELECT ("salaryMin" + COALESCE("salaryMax", "salaryMin")) / 2.0 AS mid
      FROM "Job"
      WHERE "userId" IS NULL AND "active" = true AND "salaryMin" IS NOT NULL
    ) m
    GROUP BY 1
  `);
  const ORDER = ["<50k", "50-80k", "80-110k", "110-140k", "140-180k", "180k+"];
  const map = new Map(rows.map((r) => [r.label, Number(r.count)]));
  const buckets: SalaryBucket[] = ORDER.map((label) => ({
    label,
    count: map.get(label) ?? 0,
  }));

  const [withSalary, total] = await Promise.all([
    prisma.job.count({
      where: { userId: null, active: true, salaryMin: { not: null } },
    }),
    prisma.job.count({ where: { userId: null, active: true } }),
  ]);
  const coveragePct = total === 0 ? null : Math.round((withSalary / total) * 100);
  return { buckets, coveragePct };
}

export async function getTopTech(limit = 12): Promise<TechCount[]> {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>(Prisma.sql`
    SELECT unnest("techTags") AS tag, count(*) AS count
    FROM "Job"
    WHERE "userId" IS NULL AND "active" = true
    GROUP BY 1
    ORDER BY count DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

export async function getRemoteSplit(): Promise<MarketAnalytics["remote"]> {
  const rows = await prisma.job.groupBy({
    by: ["isRemote"],
    where: { userId: null, active: true },
    _count: { _all: true },
  });
  const get = (v: boolean) =>
    rows.find((r) => r.isRemote === v)?._count._all ?? 0;
  return { remote: get(true), onsite: get(false) };
}

export async function getMarketAnalytics(): Promise<MarketAnalytics> {
  const [jobVolume, salary, topTech, remote] = await Promise.all([
    getJobVolume(),
    getSalary(),
    getTopTech(),
    getRemoteSplit(),
  ]);
  return { jobVolume, salary, topTech, remote };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/lib/analytics/market.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/analytics/market.ts src/lib/analytics/market.test.ts
git commit -m "feat(analytics): market job-volume, salary, tech, remote aggregates"
```

---

### Task 6: Personal-tab components

**Files:**
- Create: `src/components/analytics/funnel-chart.tsx`
- Create: `src/components/analytics/conversion-stats.tsx`
- Create: `src/components/analytics/time-in-stage.tsx`
- Test: `src/components/analytics/funnel-chart.test.tsx`

All are presentational client components taking typed props from `@/lib/analytics/types`. They mirror the Card/recharts idiom of `src/components/dashboard/application-trend-chart.tsx`.

- [ ] **Step 1: Write the funnel components**

```tsx
// src/components/analytics/funnel-chart.tsx
"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Funnel } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

export function FunnelChart({ funnel }: { funnel: Funnel }) {
  const data = [
    { stage: "Applied", count: funnel.applied },
    { stage: "Interviewing", count: funnel.interviewing },
    { stage: "Offer", count: funnel.offer },
  ];
  const hasData = funnel.applied > 0;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Start tracking applications to see your funnel.
          </p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                  width={90}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              {funnel.rejected} rejected. Stages reflect each application&apos;s
              current status, so an application rejected after interviewing counts
              only as rejected.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/analytics/conversion-stats.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Conversion } from "@/lib/analytics/types";

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-3xl font-extrabold tracking-tight">
        {value === null ? "—" : `${value}%`}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function ConversionStats({ conversion }: { conversion: Conversion }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Conversion</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-10">
        <Stat label="Applied → interview" value={conversion.appliedToInterview} />
        <Stat label="Interview → offer" value={conversion.interviewToOffer} />
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/analytics/time-in-stage.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeInStage } from "@/lib/analytics/types";

function Stat({
  label,
  days,
  n,
}: {
  label: string;
  days: number | null;
  n: number;
}) {
  return (
    <div>
      <div className="text-3xl font-extrabold tracking-tight">
        {days === null ? "—" : `${days}d`}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
      <div className="text-xs text-muted-foreground/70">
        {n < 3 ? "not enough data yet" : `median of ${n}`}
      </div>
    </div>
  );
}

export function TimeInStageCard({ data }: { data: TimeInStage }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Time in stage</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-10">
        <Stat
          label="Applied → response"
          days={data.appliedToResponseDays}
          n={data.appliedToResponseN}
        />
        <Stat
          label="Interview → decision"
          days={data.interviewToDecisionDays}
          n={data.interviewToDecisionN}
        />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Write a smoke test for the funnel**

```tsx
// src/components/analytics/funnel-chart.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunnelChart } from "@/components/analytics/funnel-chart";

describe("FunnelChart", () => {
  it("shows the empty prompt when no applications", () => {
    render(
      <FunnelChart funnel={{ applied: 0, interviewing: 0, offer: 0, rejected: 0 }} />,
    );
    expect(screen.getByText(/Start tracking applications/i)).toBeInTheDocument();
  });

  it("renders the rejected footnote when there is data", () => {
    render(
      <FunnelChart funnel={{ applied: 10, interviewing: 3, offer: 1, rejected: 2 }} />,
    );
    expect(screen.getByText(/2 rejected/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the smoke test**

Run: `pnpm exec vitest run src/components/analytics/funnel-chart.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/funnel-chart.tsx src/components/analytics/conversion-stats.tsx src/components/analytics/time-in-stage.tsx src/components/analytics/funnel-chart.test.tsx
git commit -m "feat(analytics): personal-tab components (funnel, conversion, time-in-stage)"
```

---

### Task 7: Market-tab components

**Files:**
- Create: `src/components/analytics/job-volume-chart.tsx`
- Create: `src/components/analytics/salary-histogram.tsx`
- Create: `src/components/analytics/tech-demand-chart.tsx`
- Create: `src/components/analytics/remote-split.tsx`

- [ ] **Step 1: Write the four components**

```tsx
// src/components/analytics/job-volume-chart.tsx
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
import type { WeeklyPoint } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "New postings", color: "var(--primary)" },
} satisfies ChartConfig;

function shortDate(v: string) {
  const d = new Date(v + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function JobVolumeChart({ points }: { points: WeeklyPoint[] }) {
  const gradientId = useId();
  const hasData = points.some((p) => p.count > 0);
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>New postings over time</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No postings in this window yet.
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
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
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

```tsx
// src/components/analytics/salary-histogram.tsx
"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SalaryBucket } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "Jobs", color: "var(--primary)" },
} satisfies ChartConfig;

export function SalaryHistogram({
  buckets,
  coveragePct,
}: {
  buckets: SalaryBucket[];
  coveragePct: number | null;
}) {
  const hasData = buckets.some((b) => b.count > 0);
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Salary distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Not enough listed salaries yet.
          </p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              {coveragePct === null
                ? null
                : `${coveragePct}% of active jobs list a salary.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/analytics/tech-demand-chart.tsx
"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TechCount } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "Jobs", color: "var(--primary)" },
} satisfies ChartConfig;

export function TechDemandChart({ tech }: { tech: TechCount[] }) {
  if (tech.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top tech in demand</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-6 text-center">
            No tagged technologies yet.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Top tech in demand</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
          <BarChart data={tech} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="tag"
              tickLine={false}
              axisLine={false}
              width={90}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

```tsx
// src/components/analytics/remote-split.tsx
"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MarketAnalytics } from "@/lib/analytics/types";

const chartConfig = {
  remote: { label: "Remote", color: "var(--primary)" },
  onsite: { label: "Onsite", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function RemoteSplit({ remote }: { remote: MarketAnalytics["remote"] }) {
  const total = remote.remote + remote.onsite;
  const data = [
    { key: "remote", label: "Remote", value: remote.remote },
    { key: "onsite", label: "Onsite", value: remote.onsite },
  ];
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Remote vs onsite</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No active jobs to split yet.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={data} dataKey="value" nameKey="label" innerRadius={50} outerRadius={80}>
                <Cell fill="var(--color-remote)" />
                <Cell fill="var(--color-onsite)" />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/job-volume-chart.tsx src/components/analytics/salary-histogram.tsx src/components/analytics/tech-demand-chart.tsx src/components/analytics/remote-split.tsx
git commit -m "feat(analytics): market-tab components (volume, salary, tech, remote)"
```

---

### Task 8: Tab switcher, page, and nav link

**Files:**
- Create: `src/components/analytics/analytics-tabs.tsx`
- Create: `src/app/(app)/analytics/page.tsx`
- Modify: `src/components/app-nav.tsx`

- [ ] **Step 1: Write the client tab switcher**

```tsx
// src/components/analytics/analytics-tabs.tsx
"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { FunnelChart } from "./funnel-chart";
import { ConversionStats } from "./conversion-stats";
import { TimeInStageCard } from "./time-in-stage";
import { JobVolumeChart } from "./job-volume-chart";
import { SalaryHistogram } from "./salary-histogram";
import { TechDemandChart } from "./tech-demand-chart";
import { RemoteSplit } from "./remote-split";
import type { PersonalAnalytics, MarketAnalytics } from "@/lib/analytics/types";
import type { ApplicationTrendPoint } from "@/lib/dashboard/application-trend";

export function AnalyticsTabs({
  personal,
  market,
  activity,
}: {
  personal: PersonalAnalytics;
  market: MarketAnalytics;
  activity: ApplicationTrendPoint[];
}) {
  return (
    <Tabs defaultValue="personal">
      <TabsList>
        <TabsTrigger value="personal">Personal</TabsTrigger>
        <TabsTrigger value="market">Market</TabsTrigger>
      </TabsList>

      <TabsContent value="personal" className="mt-5 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <ConversionStats conversion={personal.conversion} />
          <TimeInStageCard data={personal.timeInStage} />
        </div>
        <FunnelChart funnel={personal.funnel} />
        <ApplicationTrendChart points={activity} />
      </TabsContent>

      <TabsContent value="market" className="mt-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          From your sourced job feed (new-grad / internship + ATS lists).
        </p>
        <JobVolumeChart points={market.jobVolume} />
        <div className="grid gap-5 md:grid-cols-2">
          <SalaryHistogram
            buckets={market.salary.buckets}
            coveragePct={market.salary.coveragePct}
          />
          <RemoteSplit remote={market.remote} />
        </div>
        <TechDemandChart tech={market.topTech} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/(app)/analytics/page.tsx
import { requireUser } from "@/lib/auth";
import { getPersonalAnalytics } from "@/lib/analytics/personal";
import { getMarketAnalytics } from "@/lib/analytics/market";
import { getApplicationTrend } from "@/lib/dashboard/application-trend";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const [personal, market, activity] = await Promise.all([
    getPersonalAnalytics(user.id),
    getMarketAnalytics(),
    getApplicationTrend(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          How your search is going, and what the market looks like.
        </p>
      </div>
      <AnalyticsTabs personal={personal} market={market} activity={activity} />
    </div>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `src/components/app-nav.tsx`, add `BarChart3` to the `lucide-react` import (line 5-12) and insert a nav item after Applications:

```tsx
import {
  LayoutDashboard,
  UserRound,
  Briefcase,
  ClipboardList,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";
```

```tsx
const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/profile", label: "Profile", icon: UserRound, match: ["/resume"] },
];
```

- [ ] **Step 4: Typecheck + full test run**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS (existing suite + new analytics tests).

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: build succeeds; `/analytics` appears in the route list.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/analytics/page.tsx" src/components/analytics/analytics-tabs.tsx src/components/app-nav.tsx
git commit -m "feat(analytics): /analytics page, tab switcher, nav link"
```

---

### Task 9: Manual verification + push

> The DB is paused until 2026-07-01 (Neon egress). `pnpm dev` will fail to query live data. Verify what is verifiable offline now; do a live pass after the DB is restored.

- [ ] **Step 1: Offline verification**

Run: `pnpm exec vitest run && pnpm exec tsc --noEmit && pnpm build`
Expected: all green; `/analytics` in the build route manifest.

- [ ] **Step 2: Live verification (after 2026-07-01)**

Start the app (`pnpm dev`, port 3050), mint a dev session per the dev-verification flow, visit `/analytics`. Confirm: both tabs render, Personal shows funnel/conversion/time-in-stage/activity, Market shows volume/salary/tech/remote, empty states read correctly for a fresh account.

- [ ] **Step 3: Push**

```bash
git push
```

---

## Self-review notes

- **Spec coverage:** Personal funnel ✓ (T2), conversion ✓ (T2), time-in-stage ✓ (T3), activity ✓ (reused trend, T8). Market volume ✓ (T5), salary+coverage ✓ (T5), top tech ✓ (T5), remote ✓ (T5). Egress discipline ✓ (aggregates only; events are tiny user-scoped metadata). No new tables ✓. Honest labels ✓ (T8 subtitle, T6 funnel footnote, T7 salary coverage). Tabs/nav ✓ (T8). Tests mirror `src/lib/dashboard/*.test.ts` ✓.
- **Type consistency:** `_count: { _all: true }` ↔ `r._count._all` consistent across funnel/remote. `Funnel`/`Conversion`/`TimeInStage`/`MarketAnalytics` names match types.ts throughout. Component prop names match the types.
- **Known limitation (documented, not a gap):** current-status funnel undercounts mid-funnel for rejected apps — surfaced in the funnel footnote per spec.
