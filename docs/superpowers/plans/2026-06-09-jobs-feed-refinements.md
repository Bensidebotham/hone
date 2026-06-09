# Jobs Feed Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the jobs feed entry-level/CS-focused and less cluttered: drop foreign remote jobs, default to entry-level roles (toggleable), and group the feed by company with expandable role lists.

**Architecture:** Enrichment gains foreign-location (`country="INTL"`) detection and better entry-level (`level="junior"`) classification; the feed filter drops INTL and defaults to junior; the left pane is reworked to group roles by company (top-2 + "Show N more"), reusing `buildJobWhere`.

**Tech Stack:** Next.js 16 App Router, Prisma 7/Postgres (Neon), Vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-09-jobs-feed-refinements-design.md`

---

## File Structure

**Create:**
- `src/lib/jobs/grouped.ts` — `getCompanyFeedPage()` + `CompanyGroup` type
- `src/lib/jobs/grouped.test.ts` — unit test (mocked prisma)
- `src/components/company-group.tsx` — one company block (top roles + "Show N more")

**Modify:**
- `src/lib/jobs/enrich.data.ts` — `FOREIGN_MARKERS`; expand junior `LEVEL_RULES`
- `src/lib/jobs/enrich.ts` — `parseLocation` 3-way country; junior regex in `classifyRole`
- `src/lib/jobs/enrich.test.ts` — INTL + entry-level cases
- `src/lib/jobs/filters.ts` — foreign-remote OR-branch + entry-level default
- `src/lib/jobs/filters.test.ts` — updated base + level-default cases
- `src/lib/jobs/constants.ts` — shared `JOB_LIST_SELECT`
- `src/lib/jobs/actions.ts` — `loadCompanyRoles`, `loadMoreCompanies`, `getJobDetail`
- `src/components/job-filter-chips.tsx` — reworked Level options
- `src/components/jobs-browser.tsx` — grouped left pane (normal feed); saved stays flat
- `src/app/(app)/jobs/page.tsx` — call grouped query for normal feed

**Operational:**
- Re-run `scripts/backfill-enrichment.ts`

---

## Task 1: Foreign-location detection

**Files:**
- Modify: `src/lib/jobs/enrich.data.ts`, `src/lib/jobs/enrich.ts`
- Test: `src/lib/jobs/enrich.test.ts`

- [ ] **Step 1: Write failing tests** — append to `src/lib/jobs/enrich.test.ts`:

```ts
describe("parseLocation foreign detection", () => {
  it("flags foreign locations as INTL", () => {
    expect(parseLocation("London, UK")).toEqual({ country: "INTL", isRemote: false });
    expect(parseLocation("Bangalore, India")).toEqual({ country: "INTL", isRemote: false });
    expect(parseLocation("Remote - EMEA")).toEqual({ country: "INTL", isRemote: true });
    expect(parseLocation("Toronto, Canada")).toEqual({ country: "INTL", isRemote: false });
  });
  it("still resolves US before INTL", () => {
    expect(parseLocation("New York, NY")).toEqual({ country: "US", isRemote: false });
  });
  it("keeps bare Remote ambiguous (null)", () => {
    expect(parseLocation("Remote")).toEqual({ country: null, isRemote: true });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: FAIL (currently returns `null` for foreign).

- [ ] **Step 3: Add `FOREIGN_MARKERS`** to `src/lib/jobs/enrich.data.ts` (append at end):

```ts
// Non-US signals: country names, ISO-2 codes, major foreign cities, and regions.
// Matched as comma/paren/slash-split tokens (codes) or substrings (names/regions).
export const FOREIGN_COUNTRY_TOKENS = new Set([
  "uk","u.k.","gb","england","scotland","wales","ireland","ie",
  "canada","ca-canada","germany","de-germany","france","spain","italy",
  "netherlands","poland","sweden","switzerland","portugal","romania",
  "india","in-india","singapore","sg","japan","jp","china","cn",
  "australia","au","brazil","br","mexico","mx","israel","il",
]);
export const FOREIGN_MARKERS = [
  "united kingdom","england","scotland","ireland","dublin","london",
  "germany","berlin","munich","france","paris","netherlands","amsterdam",
  "spain","madrid","barcelona","italy","milan","poland","warsaw","krakow",
  "sweden","stockholm","switzerland","zurich","canada","toronto","vancouver",
  "ontario","quebec","india","bangalore","bengaluru","hyderabad","pune",
  "mumbai","delhi","gurgaon","noida","chennai","singapore","japan","tokyo",
  "china","beijing","shanghai","australia","sydney","melbourne","brazil",
  "são paulo","sao paulo","mexico city","israel","tel aviv",
  "emea","apac","latam"," eu "," europe","european union",
];
```

Note: `US_CITIES` already contains "washington"/"san jose" etc.; `FOREIGN_MARKERS` must NOT contain any US city. The "eu"/"europe" entries are space-padded to avoid matching inside words.

- [ ] **Step 4: Update `parseLocation`** in `src/lib/jobs/enrich.ts`. Add `FOREIGN_COUNTRY_TOKENS, FOREIGN_MARKERS` to the `./enrich.data` import. Replace the function body's final `return { country: null, isRemote };` with foreign detection BEFORE returning null:

```ts
export function parseLocation(location: string | null | undefined): LocationInfo {
  if (!location) return { country: null, isRemote: false };
  const raw = location.toLowerCase();
  const isRemote = /\bremote\b/.test(raw);

  if (US_MARKERS.some((m) => raw.includes(m))) {
    return { country: "US", isRemote };
  }

  const tokens = raw.split(/[,/()]/).map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    const upper = tok.toUpperCase();
    if (upper === "US" || upper === "USA") return { country: "US", isRemote };
    if (US_STATE_CODES.has(upper)) return { country: "US", isRemote };
    if (US_STATE_NAMES.has(tok)) return { country: "US", isRemote };
    if (US_CITIES.has(tok)) return { country: "US", isRemote };
  }

  // Foreign detection (after US): token codes or substring markers.
  for (const tok of tokens) {
    if (FOREIGN_COUNTRY_TOKENS.has(tok)) return { country: "INTL", isRemote };
  }
  if (FOREIGN_MARKERS.some((m) => raw.includes(m))) {
    return { country: "INTL", isRemote };
  }

  return { country: null, isRemote };
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: PASS (all prior + new foreign cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/jobs/enrich.data.ts src/lib/jobs/enrich.ts src/lib/jobs/enrich.test.ts
git commit -m "feat(jobs): detect foreign locations (country=INTL)"
```

---

## Task 2: Entry-level classification

**Files:**
- Modify: `src/lib/jobs/enrich.data.ts`, `src/lib/jobs/enrich.ts`
- Test: `src/lib/jobs/enrich.test.ts`

- [ ] **Step 1: Write failing tests** — append to `src/lib/jobs/enrich.test.ts`:

```ts
describe("classifyRole entry-level", () => {
  it("tags new-grad / associate / early-career as junior", () => {
    expect(classifyRole("New Grad Software Engineer").level).toBe("junior");
    expect(classifyRole("Associate Software Engineer").level).toBe("junior");
    expect(classifyRole("Early Career Backend Engineer").level).toBe("junior");
    expect(classifyRole("Software Engineer, University Graduate").level).toBe("junior");
  });
  it("tags numeric level I/II as junior", () => {
    expect(classifyRole("Software Engineer I").level).toBe("junior");
    expect(classifyRole("Backend Developer II").level).toBe("junior");
  });
  it("does not over-match (senior/intern unaffected)", () => {
    expect(classifyRole("Senior Software Engineer").level).toBe("senior");
    expect(classifyRole("Software Engineering Intern").level).toBe("intern");
    expect(classifyRole("Staff Engineer").level).toBe("staff");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: FAIL (e.g. "Software Engineer I" → null today).

- [ ] **Step 3: Expand junior keywords** in `src/lib/jobs/enrich.data.ts` — replace the `junior` entry in `LEVEL_RULES`:

```ts
  ["junior", ["junior", "jr.", "jr ", "entry level", "entry-level", "new grad", "new graduate", "early career", "early-career", "university grad", "university graduate", "campus", "associate", "graduate"]],
```

- [ ] **Step 4: Add numeric-level regex** in `src/lib/jobs/enrich.ts` `classifyRole`. After the keyword loop that sets `level`, add a fallback that promotes generic numeric levels to junior only when no level matched:

```ts
  let level: string | null = null;
  for (const [lvl, keywords] of LEVEL_RULES) {
    if (keywords.some((k) => t.includes(k))) {
      level = lvl;
      break;
    }
  }
  // Numeric entry levels: "Engineer I/II", "Developer 1/2", "SWE I" → junior (only if unmatched).
  if (level === null && /\b(engineer|developer|swe)\s+(i{1,2}|1|2)\b/.test(t)) {
    level = "junior";
  }

  return { roleCategory, level };
```

- [ ] **Step 5: Run — expect PASS**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/jobs/enrich.data.ts src/lib/jobs/enrich.ts src/lib/jobs/enrich.test.ts
git commit -m "feat(jobs): classify entry-level titles as junior"
```

---

## Task 3: Re-run enrichment backfill

**Files:** none (operational).

- [ ] **Step 1: Run the backfill** (recomputes country/level/etc. from stored fields):

Run: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/backfill-enrichment.ts`
Expected: "Done. N jobs enriched." (idempotent).

- [ ] **Step 2: Spot-check counts** — write a temp script `scripts/_chk.ts`, run, delete:

```ts
import { prisma } from "@/lib/db";
const CS = ["frontend","backend","fullstack","mobile","ml-ai","data","devops","security","qa"];
(async () => {
  const intl = await prisma.job.count({ where: { country: "INTL" } });
  const junior = await prisma.job.count({ where: { source:"ats", roleCategory:{in:CS}, level:"junior", OR:[{country:"US"},{AND:[{isRemote:true},{country:null}]}] } });
  console.log("INTL:", intl, "| entry-level CS-feed:", junior);
  await prisma.$disconnect();
})();
```
Run: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/_chk.ts && rm scripts/_chk.ts`
Expected: non-zero INTL count and a larger entry-level count than the prior ~14. Record the entry-level number (informs whether the default feed is healthy).

- [ ] **Step 3: No commit** (data-only). Proceed.

---

## Task 4: Feed filter — drop foreign + default entry-level

**Files:**
- Modify: `src/lib/jobs/filters.ts`
- Test: `src/lib/jobs/filters.test.ts`

- [ ] **Step 1: Update tests** — replace `src/lib/jobs/filters.test.ts` body with:

```ts
import { describe, it, expect } from "vitest";
import { buildJobWhere } from "./filters";

const USER = "user_1";

describe("buildJobWhere", () => {
  it("base: ATS + CS + (US or ambiguous-remote), foreign dropped", () => {
    const where = buildJobWhere({}, USER);
    expect(where).toMatchObject({
      source: "ats",
      roleCategory: { in: expect.arrayContaining(["frontend", "backend"]) },
      OR: [{ country: "US" }, { AND: [{ isRemote: true }, { country: null }] }],
    });
  });

  it("defaults to entry-level (junior) when no level param", () => {
    const where = buildJobWhere({}, USER);
    expect(where.AND).toContainEqual({ level: "junior" });
  });

  it("level=all removes the level filter", () => {
    const where = buildJobWhere({ level: "all" }, USER);
    const conds = (where.AND as Array<Record<string, unknown>>) ?? [];
    expect(conds.some((c) => "level" in c)).toBe(false);
  });

  it("level=senior filters senior", () => {
    const where = buildJobWhere({ level: "senior" }, USER);
    expect(where.AND).toContainEqual({ level: "senior" });
  });

  it("keyword search across title and company still works", () => {
    const where = buildJobWhere({ q: "react" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { title: { contains: "react", mode: "insensitive" } },
        { company: { contains: "react", mode: "insensitive" } },
      ],
    });
  });

  it("salaryMin floor with undisclosed-exclusion", () => {
    const where = buildJobWhere({ salaryMin: "150000" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { salaryMax: { gte: 150000 } },
        { AND: [{ salaryMax: null }, { salaryMin: { gte: 150000 } }] },
      ],
    });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/jobs/filters.test.ts`
Expected: FAIL (old base OR shape; no level default).

- [ ] **Step 3: Update `buildJobWhere`** in `src/lib/jobs/filters.ts`. Change the `base` OR-branch and replace the `if (params.level)` block with the default logic:

Change `base`:
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

Replace the existing level block (`if (params.level) { conditions.push({ level: params.level }); }`) with:
```ts
  // Entry-level default: no level param → junior; "all" → no filter; else that level.
  const levelParam = params.level;
  if (levelParam === "all") {
    // show all levels
  } else if (levelParam) {
    conditions.push({ level: levelParam });
  } else {
    conditions.push({ level: "junior" });
  }
```

(Leave everything else unchanged. Note `conditions` now always has at least the level entry, so `buildJobWhere` always returns `{ ...base, AND }`.)

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/jobs/filters.test.ts && npx tsc --noEmit`
Expected: PASS, types clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/filters.ts src/lib/jobs/filters.test.ts
git commit -m "feat(jobs): drop foreign remote + default feed to entry-level"
```

---

## Task 5: Level chip rework

**Files:**
- Modify: `src/components/job-filter-chips.tsx`

- [ ] **Step 1: Replace `LEVEL_OPTIONS`** (lines 16-19) with:

```ts
const LEVEL_OPTIONS = [
  ["", "Entry-level"], ["all", "All levels"], ["intern", "Internships"],
  ["mid", "Mid"], ["senior", "Senior"], ["staff", "Staff"],
  ["lead", "Lead"], ["manager", "Manager"],
] as const;
```

(The `level` chip already binds to `sp.get("level") ?? ""`, so the empty value shows "Entry-level" selected by default, and picking it clears the param — which `buildJobWhere` reads as the junior default. No other change needed.)

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/job-filter-chips.tsx
git commit -m "feat(jobs): Level chip defaults to Entry-level with All-levels toggle"
```

---

## Task 6: Shared select constant

**Files:**
- Modify: `src/lib/jobs/constants.ts`

- [ ] **Step 1: Add `JOB_LIST_SELECT`** to `src/lib/jobs/constants.ts` (after `JobListRow`):

```ts
/** Prisma select matching JobListRow — shared by feed/grouped/action queries. */
export const JOB_LIST_SELECT = {
  id: true, title: true, company: true, location: true, url: true,
  salary: true, postedAt: true, roleCategory: true, level: true,
  techTags: true, descriptionText: true, descriptionHtml: true,
} as const;
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add src/lib/jobs/constants.ts
git commit -m "refactor(jobs): shared JOB_LIST_SELECT constant"
```

---

## Task 7: Grouped feed query

**Files:**
- Create: `src/lib/jobs/grouped.ts`, `src/lib/jobs/grouped.test.ts`

- [ ] **Step 1: Write failing test** `src/lib/jobs/grouped.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const groupBy = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { job: { groupBy: (...a: unknown[]) => groupBy(...a), findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/lib/jobs/filters", () => ({ buildJobWhere: () => ({ source: "ats" }) }));

import { getCompanyFeedPage, COMPANIES_PER_PAGE } from "./grouped";

beforeEach(() => { groupBy.mockReset(); findMany.mockReset(); });

describe("getCompanyFeedPage", () => {
  it("returns groups with totalCount and top-2 roles, hasMore=false", async () => {
    groupBy.mockResolvedValue([
      { company: "Stripe", _count: { _all: 12 }, _max: { postedAt: new Date(), salaryMax: 200000 } },
      { company: "Vercel", _count: { _all: 3 }, _max: { postedAt: new Date(), salaryMax: 180000 } },
    ]);
    findMany.mockImplementation(({ where }: { where: { AND: Array<{ company?: string }> } }) => {
      const company = where.AND[1].company;
      return Promise.resolve([{ id: company + "-1" }, { id: company + "-2" }]);
    });
    const res = await getCompanyFeedPage({}, "u1", 0);
    expect(res.hasMore).toBe(false);
    expect(res.groups).toHaveLength(2);
    expect(res.groups[0]).toMatchObject({ company: "Stripe", totalCount: 12 });
    expect(res.groups[0].topRoles).toHaveLength(2);
  });

  it("sets hasMore=true when groupBy returns more than a page", async () => {
    const many = Array.from({ length: COMPANIES_PER_PAGE + 1 }, (_, i) => ({
      company: "C" + i, _count: { _all: 1 }, _max: { postedAt: new Date(), salaryMax: 1 },
    }));
    groupBy.mockResolvedValue(many);
    findMany.mockResolvedValue([{ id: "x" }]);
    const res = await getCompanyFeedPage({}, "u1", 0);
    expect(res.hasMore).toBe(true);
    expect(res.groups).toHaveLength(COMPANIES_PER_PAGE);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/lib/jobs/grouped.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `src/lib/jobs/grouped.ts`:

```ts
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { jobOrderBy, JOB_LIST_SELECT, type JobListRow } from "@/lib/jobs/constants";

export const COMPANIES_PER_PAGE = 12;

export interface CompanyGroup {
  company: string;
  totalCount: number;
  topRoles: JobListRow[];
}

export async function getCompanyFeedPage(
  params: Record<string, string | undefined>,
  userId: string,
  page: number
): Promise<{ groups: CompanyGroup[]; hasMore: boolean }> {
  const where = buildJobWhere(params, userId);
  const companyOrder =
    params.sort === "salary"
      ? { _max: { salaryMax: "desc" as const } }
      : { _max: { postedAt: "desc" as const } };

  const grouped = await prisma.job.groupBy({
    by: ["company"],
    where,
    _count: { _all: true },
    _max: { postedAt: true, salaryMax: true },
    orderBy: companyOrder,
    take: COMPANIES_PER_PAGE + 1,
    skip: page * COMPANIES_PER_PAGE,
  });

  const hasMore = grouped.length > COMPANIES_PER_PAGE;
  const pageCompanies = grouped.slice(0, COMPANIES_PER_PAGE);

  const groups = await Promise.all(
    pageCompanies.map(async (g) => {
      const topRoles = await prisma.job.findMany({
        where: { AND: [where, { company: g.company }] },
        orderBy: jobOrderBy(params.sort),
        take: 2,
        select: JOB_LIST_SELECT,
      });
      return { company: g.company, totalCount: g._count._all, topRoles };
    })
  );

  return { groups, hasMore };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run src/lib/jobs/grouped.test.ts && npx tsc --noEmit`
Expected: PASS, types clean. (If the `groupBy` `orderBy: { _max: {...} }` type is rejected, report — it is supported in Prisma 7; ensure `_max` selects the same field.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/grouped.ts src/lib/jobs/grouped.test.ts
git commit -m "feat(jobs): company-grouped feed query"
```

---

## Task 8: Server actions for grouping

**Files:**
- Modify: `src/lib/jobs/actions.ts`

- [ ] **Step 1: Add three actions.** Update `src/lib/jobs/actions.ts` — add imports and functions (keep existing `loadMoreJobs`):

Change the constants import line to include `JOB_LIST_SELECT`:
```ts
import { JOBS_PAGE_SIZE, jobOrderBy, JOB_LIST_SELECT, type JobListRow } from "@/lib/jobs/constants";
```
Add import:
```ts
import { getCompanyFeedPage, type CompanyGroup } from "@/lib/jobs/grouped";
```
Append:
```ts
export async function loadCompanyRoles(
  company: string,
  params: Record<string, string | undefined>
): Promise<JobListRow[]> {
  const user = await requireUser();
  const where = buildJobWhere(params, user.id);
  return prisma.job.findMany({
    where: { AND: [where, { company }] },
    orderBy: jobOrderBy(params.sort),
    skip: 2,
    take: 50,
    select: JOB_LIST_SELECT,
  });
}

export async function loadMoreCompanies(
  params: Record<string, string | undefined>,
  page: number
): Promise<{ groups: CompanyGroup[]; hasMore: boolean }> {
  const user = await requireUser();
  return getCompanyFeedPage(params, user.id, page);
}

export async function getJobDetail(id: string): Promise<JobListRow | null> {
  await requireUser();
  return prisma.job.findUnique({ where: { id }, select: JOB_LIST_SELECT });
}
```

Also update the existing `loadMoreJobs` `select:` block to use the shared constant: replace its inline `select: { ... }` with `select: JOB_LIST_SELECT,`.

- [ ] **Step 2: Verify + commit**

Run: `npx tsc --noEmit`
```bash
git add src/lib/jobs/actions.ts
git commit -m "feat(jobs): grouping server actions (company roles, more companies, job detail)"
```

---

## Task 9: CompanyGroup component

> **Implement Tasks 9 and 10 together** — `company-group.tsx` and `jobs-browser.tsx` import from each other (`toBrowserJob`/`BrowserJob` ← jobs-browser; `BrowserGroup`/`CompanyGroup` ← company-group). Neither compiles alone. Create both files, then run the single verify + commit at the end of Task 10. If the bundler reports a circular-import runtime error, extract `toBrowserJob` + `BrowserJob` into `src/components/job-browser-types.ts` and import from there in both files.

**Files:**
- Create: `src/components/company-group.tsx`

- [ ] **Step 1: Implement** `src/components/company-group.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { JobListItem } from "@/components/job-list-item";
import { loadCompanyRoles } from "@/lib/jobs/actions";
import { toBrowserJob, type BrowserJob } from "@/components/jobs-browser";

export interface BrowserGroup {
  company: string;
  totalCount: number;
  topRoles: BrowserJob[];
}

export function CompanyGroup({
  group,
  params,
  selectedId,
  savedIds,
  onSelect,
  onRolesLoaded,
}: {
  group: BrowserGroup;
  params: Record<string, string | undefined>;
  selectedId: string | null;
  savedIds: Set<string>;
  onSelect: (id: string) => void;
  onRolesLoaded: (rows: BrowserJob[]) => void;
}) {
  const [extra, setExtra] = useState<BrowserJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const shown = [...group.topRoles, ...extra];
  const remaining = group.totalCount - shown.length;

  async function showMore() {
    setLoading(true);
    const rows = await loadCompanyRoles(group.company, params);
    const mapped = rows.map(toBrowserJob);
    setExtra(mapped);
    setExpanded(true);
    onRolesLoaded(mapped);
    setLoading(false);
  }

  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40">
        <CompanyLogo company={group.company} size={24} />
        <span className="font-medium text-sm">{group.company}</span>
        <span className="text-xs text-muted-foreground">
          {group.totalCount} {group.totalCount === 1 ? "role" : "roles"}
        </span>
      </div>
      {shown.map((job) => (
        <JobListItem
          key={job.id}
          job={job}
          selected={job.id === selectedId}
          saved={savedIds.has(job.id)}
          onSelect={() => onSelect(job.id)}
        />
      ))}
      {!expanded && remaining > 0 && (
        <button
          type="button"
          onClick={showMore}
          disabled={loading}
          className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-muted/50 disabled:opacity-50"
        >
          {loading ? "Loading…" : `Show ${remaining} more at ${group.company}`}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Do not verify/commit yet** — proceed straight to Task 10, which creates `jobs-browser.tsx` (providing `toBrowserJob`/`BrowserJob`) and runs the combined verify + commit for both files.

---

## Task 10: JobsBrowser grouped mode + page wiring

**Files:**
- Modify: `src/components/jobs-browser.tsx`, `src/app/(app)/jobs/page.tsx`

- [ ] **Step 1: Rewrite `src/components/jobs-browser.tsx`** to support grouped (normal feed) + flat (saved). Full file:

```tsx
// src/components/jobs-browser.tsx
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobListItem, type JobListItemData } from "@/components/job-list-item";
import { JobDetailPane, type JobDetailData } from "@/components/job-detail-pane";
import { CompanyGroup, type BrowserGroup } from "@/components/company-group";
import { loadMoreJobs, loadMoreCompanies, getJobDetail } from "@/lib/jobs/actions";
import { type JobListRow } from "@/lib/jobs/constants";

export interface BrowserJob extends JobListItemData {
  url: string | null;
  descriptionText: string;
  descriptionHtml: string | null;
}

export function toBrowserJob(row: JobListRow): BrowserJob {
  return {
    id: row.id, title: row.title, company: row.company, location: row.location,
    salary: row.salary, url: row.url,
    postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : null,
    techTags: row.techTags, descriptionText: row.descriptionText,
    descriptionHtml: row.descriptionHtml,
  };
}

function toDetail(j: BrowserJob): JobDetailData {
  return {
    id: j.id, title: j.title, company: j.company, location: j.location,
    salary: j.salary, url: j.url, descriptionText: j.descriptionText,
    descriptionHtml: j.descriptionHtml,
  };
}

export function JobsBrowser({
  savedView,
  initialJobs,
  initialCursor,
  initialGroups,
  hasMoreCompanies,
  savedIds,
  hasFilters,
}: {
  savedView?: boolean;
  initialJobs?: BrowserJob[];
  initialCursor?: string | null;
  initialGroups?: BrowserGroup[];
  hasMoreCompanies?: boolean;
  savedIds: string[];
  hasFilters: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const saved = useMemo(() => new Set(savedIds), [savedIds]);

  // Flat (saved) state
  const [jobs, setJobs] = useState<BrowserJob[]>(initialJobs ?? []);
  const [cursor, setCursor] = useState(initialCursor ?? null);

  // Grouped (normal) state
  const [groups, setGroups] = useState<BrowserGroup[]>(initialGroups ?? []);
  const [coPage, setCoPage] = useState(0);
  const [moreCos, setMoreCos] = useState(!!hasMoreCompanies);

  // Shared
  const [loading, setLoading] = useState(false);
  const [rolesById, setRolesById] = useState<Map<string, BrowserJob>>(() => {
    const m = new Map<string, BrowserJob>();
    (initialJobs ?? []).forEach((j) => m.set(j.id, j));
    (initialGroups ?? []).forEach((g) => g.topRoles.forEach((j) => m.set(j.id, j)));
    return m;
  });

  const registerRoles = useCallback((rows: BrowserJob[]) => {
    setRolesById((prev) => {
      const m = new Map(prev);
      rows.forEach((j) => m.set(j.id, j));
      return m;
    });
  }, []);

  const flatParams = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    sp.forEach((v, k) => { if (k !== "selected") f[k] = v; });
    return f;
  }, [sp]);

  const firstId = savedView ? jobs[0]?.id : groups[0]?.topRoles[0]?.id;
  const explicitSelected = sp.get("selected");
  const selectedId = explicitSelected ?? firstId ?? null;
  const selectedJob = selectedId ? rolesById.get(selectedId) ?? null : null;

  // Resolve a deep-linked selection not yet loaded.
  useEffect(() => {
    if (selectedId && !rolesById.has(selectedId)) {
      getJobDetail(selectedId).then((row) => {
        if (row) registerRoles([toBrowserJob(row)]);
      });
    }
  }, [selectedId, rolesById, registerRoles]);

  function select(id: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("selected", id);
    router.replace(`/jobs?${params.toString()}`, { scroll: false });
  }
  function clearSelection() {
    const params = new URLSearchParams(sp.toString());
    params.delete("selected");
    const qs = params.toString();
    router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
  }

  async function moreJobs() {
    if (!cursor) return;
    setLoading(true);
    const res = await loadMoreJobs(flatParams, cursor);
    const mapped = res.jobs.map(toBrowserJob);
    setJobs((p) => [...p, ...mapped]);
    registerRoles(mapped);
    setCursor(res.nextCursor);
    setLoading(false);
  }
  async function moreCompanies() {
    setLoading(true);
    const next = coPage + 1;
    const res = await loadMoreCompanies(flatParams, next);
    setGroups((p) => [...p, ...res.groups]);
    res.groups.forEach((g) => registerRoles(g.topRoles));
    setCoPage(next);
    setMoreCos(res.hasMore);
    setLoading(false);
  }

  const isEmpty = savedView ? jobs.length === 0 : groups.length === 0;
  if (isEmpty) {
    if (savedView) {
      return <EmptyState title="No saved jobs yet" message="Tap the ☆ on a job to bookmark it and find it here." />;
    }
    return (
      <EmptyState
        title="No jobs match your filters"
        message={hasFilters ? "Try widening your filters, or switch the Level chip to “All levels.”" : "Try the Level chip → “All levels.”"}
      />
    );
  }

  const detail: JobDetailData | null = selectedJob ? toDetail(selectedJob) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border border-border rounded-lg overflow-hidden h-[calc(100vh-220px)]">
      <div className={`${explicitSelected ? "hidden md:flex" : "flex"} flex-col overflow-y-auto border-r border-border min-h-0`}>
        {savedView
          ? jobs.map((job) => (
              <JobListItem key={job.id} job={job} selected={job.id === selectedId} saved={saved.has(job.id)} onSelect={() => select(job.id)} />
            ))
          : groups.map((g) => (
              <CompanyGroup
                key={g.company}
                group={g}
                params={flatParams}
                selectedId={selectedId}
                savedIds={saved}
                onSelect={select}
                onRolesLoaded={registerRoles}
              />
            ))}
        {savedView && cursor && (
          <div className="p-3">
            <Button variant="outline" size="sm" onClick={moreJobs} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
        {!savedView && moreCos && (
          <div className="p-3">
            <Button variant="outline" size="sm" onClick={moreCompanies} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more companies"}
            </Button>
          </div>
        )}
      </div>
      <div className={`${explicitSelected ? "flex" : "hidden"} md:flex flex-col min-h-0 h-full overflow-hidden`}>
        <button type="button" onClick={clearSelection} className="md:hidden flex items-center gap-1 px-4 py-2 text-sm text-primary border-b border-border">
          ← Back to results
        </button>
        <div className="flex-1 min-h-0">
          <JobDetailPane job={detail} />
        </div>
      </div>
    </div>
  );
}
```

Note: `BrowserGroup` is imported from `company-group.tsx`, and `company-group.tsx` imports `toBrowserJob`/`BrowserJob` from this file — this is a circular import of types/functions but resolves fine (ES modules handle it; `toBrowserJob` is a function declaration, hoisted). If the bundler complains, move `toBrowserJob` + `BrowserJob` into a tiny `src/components/job-browser-types.ts` and import from there in both files.

- [ ] **Step 2: Wire the page** — update `src/app/(app)/jobs/page.tsx`. Replace the data-fetch + render so the normal feed uses `getCompanyFeedPage` and the saved feed stays flat:

```tsx
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { listSavedJobIds } from "@/lib/jobs/saved-queries";
import { JOBS_PAGE_SIZE, jobOrderBy, JOB_LIST_SELECT } from "@/lib/jobs/constants";
import { getCompanyFeedPage } from "@/lib/jobs/grouped";
import { JobSearchBar } from "@/components/job-search-bar";
import { JobFilterChips } from "@/components/job-filter-chips";
import { JobsBrowser, toBrowserJob } from "@/components/jobs-browser";
import { type BrowserGroup } from "@/components/company-group";
import { JobScopeTabs } from "@/components/job-scope-tabs";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const user = await requireUser();
  const params: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawParams)) params[k] = Array.isArray(v) ? v[0] : v;

  const savedSet = await listSavedJobIds(user.id);
  const isSavedView = params.saved === "true";
  const filterKeys = Object.keys(rawParams).filter((k) => k !== "selected");

  if (isSavedView) {
    const where = { id: { in: [...savedSet] } };
    const [rows, totalCount] = await Promise.all([
      prisma.job.findMany({ where, orderBy: jobOrderBy(params.sort), take: JOBS_PAGE_SIZE, select: JOB_LIST_SELECT }),
      prisma.job.count({ where }),
    ]);
    const initialJobs = rows.map(toBrowserJob);
    const initialCursor = rows.length === JOBS_PAGE_SIZE ? rows[rows.length - 1].id : null;
    return (
      <div className="max-w-6xl">
        <JobsHeader savedCount={savedSet.size} totalCount={totalCount} isSavedView filterKeys={filterKeys} />
        <JobsBrowser savedView initialJobs={initialJobs} initialCursor={initialCursor} savedIds={[...savedSet]} hasFilters={filterKeys.length > 0} />
      </div>
    );
  }

  const where = buildJobWhere(params, user.id);
  const [{ groups, hasMore }, totalCount] = await Promise.all([
    getCompanyFeedPage(params, user.id, 0),
    prisma.job.count({ where }),
  ]);
  const initialGroups: BrowserGroup[] = groups.map((g) => ({
    company: g.company, totalCount: g.totalCount, topRoles: g.topRoles.map(toBrowserJob),
  }));

  return (
    <div className="max-w-6xl">
      <JobsHeader savedCount={savedSet.size} totalCount={totalCount} isSavedView={false} filterKeys={filterKeys} />
      <div className="flex flex-col gap-3 mb-4">
        <JobSearchBar />
        <JobFilterChips />
      </div>
      <JobsBrowser initialGroups={initialGroups} hasMoreCompanies={hasMore} savedIds={[...savedSet]} hasFilters={filterKeys.length > 0} />
    </div>
  );
}

function JobsHeader({ savedCount, totalCount, isSavedView, filterKeys }: { savedCount: number; totalCount: number; isSavedView: boolean; filterKeys: string[] }) {
  return (
    <>
      <h1 className="text-2xl font-semibold mb-1">Jobs</h1>
      <p className="text-muted-foreground mb-4">Entry-level US software roles, grouped by company.</p>
      <div className="mb-3"><JobScopeTabs savedCount={savedCount} /></div>
      <p className="text-sm text-muted-foreground mb-3">
        {isSavedView
          ? `${totalCount.toLocaleString()} ${totalCount === 1 ? "saved role" : "saved roles"}`
          : `${totalCount.toLocaleString()} ${totalCount === 1 ? "role" : "roles"}${filterKeys.length > 0 ? " match your filters" : " available"}`}
      </p>
    </>
  );
}
```

(`JobScopeTabs` is a client component imported into this server component — already the case today.)

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: types clean, build compiles. If a circular-import error appears, apply the `job-browser-types.ts` extraction noted in Task 10 Step 1.

- [ ] **Step 4: Run unit + commit**

Run: `npm run test` (full suite green)
```bash
git add src/components/jobs-browser.tsx src/components/company-group.tsx "src/app/(app)/jobs/page.tsx"
git commit -m "feat(jobs): company-grouped feed UI (top roles + show more)"
```

- [ ] **Step 5: Manual smoke** (clean dev server — restart first because the data changed):

```bash
pkill -f "next dev"; npm run dev
```
Open `http://localhost:3050/jobs` (signed in): feed grouped by company, each shows ≤2 roles + "Show N more", Level chip shows "Entry-level" default, no foreign jobs, sort works, Saved tab still flat. Expand a company; select a role; detail renders.

---

## Task 11: E2E spec touch-up

**Files:**
- Modify: `e2e/jobs.spec.ts`

- [ ] **Step 1: Update the deferred (commented) authed block** in `e2e/jobs.spec.ts` to reflect grouping — add, inside the existing commented authed flow, an assertion that a "Show N more" control and the "Entry-level"/"All levels" Level options exist. Keep it within the repo's existing commented-authed convention (the live test remains the unauth redirect). Example to include in the commented block:

```ts
// await expect(page.getByLabel("level")).toContainText("Entry-level");
// await page.getByRole("button", { name: /Show \d+ more/ }).first().click();
```

- [ ] **Step 2: Run e2e (unauth guard still passes) + commit**

Run: `npm run e2e -- jobs.spec.ts`
Expected: the active unauth-redirect test passes.
```bash
git add e2e/jobs.spec.ts
git commit -m "test(jobs): note grouped/entry-level e2e steps"
```

---

## Final verification
- [ ] `npm run test` → all green.
- [ ] `npx tsc --noEmit` → clean.
- [ ] `npm run build` → compiles.
- [ ] Manual (clean dev server): grouped feed, entry-level default, no foreign, expand company, sort, saved tab.
- [ ] Backfill ran (INTL + entry-level counts confirmed in Task 3).

## Notes / deviations
- No new DB columns: `country` reuses its string column with a new `"INTL"` value; `level` just gets more `junior`s.
- Foreign detection is heuristic (city/country/region markers); US detection runs first so US always wins ties.
- Grouped pagination is by company (12/page); within a company, "Show more" loads up to 50 — deeper is out of scope.
- Saved view intentionally stays a flat list and bypasses the entry-level/foreign feed filter.
