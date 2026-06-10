# New-Grad Job Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the jobs feature into a flat, LinkedIn-style feed that surfaces a long list of relevant new-grad / entry-level software roles, sourced primarily from open-source new-grad aggregator lists plus an expanded ATS roster.

**Architecture:** One `Job` table and one enrich pipeline. A new aggregator fetcher emits the same `NormalizedJob` shape from Simplify's `listings.json` and upserts with `source="aggregator"`; ATS polling continues unchanged but with loud failures and a bigger roster. The feed query defaults to entry-level full-time and renders a flat infinite-scroll list (the company-grouped view is retired).

**Tech Stack:** Next.js (App Router), Prisma 7 + Neon Postgres, Trigger.dev (hourly cron), Vitest (unit), Playwright (e2e), Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-06-10-newgrad-job-feed-design.md`

**Conventions:** Tests are co-located `*.test.ts` next to the module. Run a single test file with `npx vitest run <path>`. Commit after every task.

**Refinement vs spec:** the spec described a separate employment-type chip *plus* a level chip. During planning we collapsed these into a single 3-way "audience" chip (New grad / Internships / All roles) on the existing `level` URL param — cleaner for a new-grad product. Behavior is identical to the spec's intent.

---

## Phase 1 — Data, relevance, sourcing

### Task 1: Schema — add `aggregator` source, `employmentType`, `active`

**Files:**
- Modify: `prisma/schema.prisma` (enum `JobSource` ~line 109; model `Job` ~line 114)

- [ ] **Step 1: Add the enum value and columns**

In `prisma/schema.prisma`, change the `JobSource` enum:

```prisma
enum JobSource {
  ats
  paste
  aggregator
}
```

In `model Job`, add two fields just after the `// Enrichment ...` block (after `salaryMax Int?`):

```prisma
  // Sourcing metadata
  employmentType  String?       // "fulltime" | "internship"
  active          Boolean       @default(true)
```

And add an index alongside the existing `@@index` lines:

```prisma
  @@index([employmentType])
  @@index([active])
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name add_aggregator_employmenttype_active`
Expected: a new folder under `prisma/migrations/`, "Your database is now in sync with your schema", and `prisma generate` runs.

- [ ] **Step 3: Verify the client types**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors). Confirms `JobSource.aggregator`, `Job.employmentType`, `Job.active` exist on the generated client.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(jobs): add aggregator source, employmentType, active to Job schema"
```

---

### Task 2: `classifyEmploymentType` classifier

**Files:**
- Modify: `src/lib/jobs/enrich.ts`
- Test: `src/lib/jobs/enrich.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/jobs/enrich.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { classifyEmploymentType, enrichJob } from "./enrich";

describe("classifyEmploymentType", () => {
  it("detects internships", () => {
    expect(classifyEmploymentType("Software Engineer Intern")).toBe("internship");
    expect(classifyEmploymentType("Summer 2027 Internship, Backend")).toBe("internship");
    expect(classifyEmploymentType("Engineering Co-Op")).toBe("internship");
    expect(classifyEmploymentType("Engineering Co op")).toBe("internship");
  });

  it("defaults everything else to fulltime", () => {
    expect(classifyEmploymentType("Software Engineer, New Grad")).toBe("fulltime");
    expect(classifyEmploymentType("Senior Backend Engineer")).toBe("fulltime");
    expect(classifyEmploymentType("")).toBe("fulltime");
    expect(classifyEmploymentType(null)).toBe("fulltime");
  });

  it("does not false-positive on substrings", () => {
    expect(classifyEmploymentType("Internal Tools Engineer")).toBe("fulltime");
    expect(classifyEmploymentType("Cooperative Systems Engineer")).toBe("fulltime");
  });

  it("enrichJob includes employmentType", () => {
    const e = enrichJob({ title: "Backend Engineer Intern", location: "Remote", descriptionText: "", salary: null });
    expect(e.employmentType).toBe("internship");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: FAIL with "classifyEmploymentType is not a function" (and `enrichJob` result missing `employmentType`).

- [ ] **Step 3: Implement**

In `src/lib/jobs/enrich.ts`, add the function (place it above `enrichJob`):

```ts
export type EmploymentType = "fulltime" | "internship";

export function classifyEmploymentType(title: string | null | undefined): EmploymentType {
  const t = (title ?? "").toLowerCase();
  // \bintern\b matches "intern"/"interns"/"internship"? No — \bintern\b won't match "internship".
  // Use intern(ship)? to cover both, and co[-\s]?op for co-op / co op / coop.
  if (/\bintern(ship)?\b/.test(t) || /\bco[-\s]?op\b/.test(t)) return "internship";
  return "fulltime";
}
```

Extend the `JobEnrichment` interface (add `employmentType: EmploymentType;`) and the `enrichJob` return:

```ts
export interface JobEnrichment {
  country: string | null;
  isRemote: boolean;
  roleCategory: string;
  level: string | null;
  techTags: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  employmentType: EmploymentType;
}
```

In `enrichJob`, add to the returned object:

```ts
  return { country, isRemote, roleCategory, level, techTags, salaryMin, salaryMax, employmentType: classifyEmploymentType(input.title) };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/enrich.ts src/lib/jobs/enrich.test.ts
git commit -m "feat(jobs): classify employment type (fulltime/internship)"
```

---

### Task 3: URL normalization for dedup

**Files:**
- Create: `src/lib/jobs/url.ts`
- Test: `src/lib/jobs/url.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/jobs/url.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeUrl } from "./url";

describe("normalizeUrl", () => {
  it("lowercases host+path and strips query/hash/trailing slash", () => {
    expect(normalizeUrl("https://Boards.Greenhouse.io/Stripe/jobs/123/")).toBe("boards.greenhouse.io/stripe/jobs/123");
    expect(normalizeUrl("https://x.com/a?utm=1#frag")).toBe("x.com/a");
  });
  it("treats http/https the same path-wise (host kept)", () => {
    expect(normalizeUrl("http://x.com/a")).toBe("x.com/a");
  });
  it("returns null for empty or invalid input", () => {
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/url.test.ts`
Expected: FAIL with "Cannot find module './url'".

- [ ] **Step 3: Implement**

Create `src/lib/jobs/url.ts`:

```ts
/** Normalize a URL to a stable dedup key: lowercased host+path, no query/hash/trailing slash. */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/url.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/url.ts src/lib/jobs/url.test.ts
git commit -m "feat(jobs): add normalizeUrl for cross-source dedup"
```

---

### Task 4: Aggregator source config + `parseListings`

**Files:**
- Create: `src/lib/jobs/aggregator.ts`
- Test: `src/lib/jobs/aggregator.test.ts` (create)

The Simplify `listings.json` schema (verified 2026-06-10): array of objects with
`id, company_name, title, locations[], url, date_posted (unix s), date_updated, active, is_visible, category, sponsorship, degrees[]` (+ `terms[]` on internship lists). No description, no salary.

- [ ] **Step 1: Write the failing test**

Create `src/lib/jobs/aggregator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseListings, type AggregatorSource } from "./aggregator";

const NEWGRAD: AggregatorSource = {
  name: "Simplify New-Grad", url: "https://example/listings.json",
  employmentType: "fulltime", level: "junior", externalIdPrefix: "simplify:newgrad",
};

describe("parseListings", () => {
  it("maps a visible listing to a NormalizedJob with authoritative level/employmentType", () => {
    const raw = [{
      id: "abc", company_name: "Acme", title: "Software Engineer, New Grad",
      locations: ["San Jose, CA", "Remote in USA"], url: "https://acme.com/jobs/1",
      date_posted: 1760362966, active: true, is_visible: true, category: "Software Engineering",
    }];
    const [j] = parseListings(raw, NEWGRAD);
    expect(j).toMatchObject({
      externalId: "simplify:newgrad:abc",
      company: "Acme",
      title: "Software Engineer, New Grad",
      location: "San Jose, CA · Remote in USA",
      url: "https://acme.com/jobs/1",
      descriptionText: "",
      descriptionHtml: "",
      salary: null,
      active: true,
      employmentType: "fulltime",
      level: "junior",
    });
    expect(j.postedAt?.getTime()).toBe(1760362966 * 1000);
  });

  it("skips entries where is_visible is not true", () => {
    const raw = [{ id: "x", company_name: "A", title: "T", locations: [], url: "u", date_posted: 1, is_visible: false, active: true }];
    expect(parseListings(raw, NEWGRAD)).toHaveLength(0);
  });

  it("carries active=false through (for feed exclusion)", () => {
    const raw = [{ id: "x", company_name: "A", title: "T", locations: ["NYC"], url: "u", date_posted: 1, is_visible: true, active: false }];
    expect(parseListings(raw, NEWGRAD)[0].active).toBe(false);
  });

  it("tolerates missing/garbage input", () => {
    expect(parseListings(null, NEWGRAD)).toEqual([]);
    expect(parseListings([{ is_visible: true }], NEWGRAD)).toEqual([]); // missing id/title/company
    expect(parseListings([42, "x", null], NEWGRAD)).toEqual([]);
  });

  it("null location when no valid locations", () => {
    const raw = [{ id: "x", company_name: "A", title: "T", locations: [], url: "u", date_posted: 1, is_visible: true, active: true }];
    expect(parseListings(raw, NEWGRAD)[0].location).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/aggregator.test.ts`
Expected: FAIL with "Cannot find module './aggregator'".

- [ ] **Step 3: Implement**

Create `src/lib/jobs/aggregator.ts`:

```ts
import type { NormalizedJob } from "./fetchers";
import type { EmploymentType } from "./enrich";

export interface AggregatorSource {
  name: string;
  url: string;
  employmentType: EmploymentType;
  level: "junior" | "intern";
  externalIdPrefix: string;
}

export interface AggregatorJob extends NormalizedJob {
  active: boolean;
  employmentType: EmploymentType;
  level: "junior" | "intern";
}

/** Identify ourselves politely to the source host. */
export const AGGREGATOR_USER_AGENT =
  "hone-job-suite/1.0 (+https://github.com/SimplifyJobs; personal new-grad job board)";

/** Configured open-source new-grad / internship lists. Add Summer2027-Internships when it exists. */
export const AGGREGATOR_SOURCES: AggregatorSource[] = [
  {
    name: "Simplify New-Grad",
    url: "https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json",
    employmentType: "fulltime",
    level: "junior",
    externalIdPrefix: "simplify:newgrad",
  },
  {
    name: "Simplify Summer 2026 Internships",
    url: "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
    employmentType: "internship",
    level: "intern",
    externalIdPrefix: "simplify:intern",
  },
];

export function parseListings(raw: unknown, src: AggregatorSource): AggregatorJob[] {
  if (!Array.isArray(raw)) return [];
  const out: AggregatorJob[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const j = item as Record<string, unknown>;
    if (j.is_visible !== true) continue;
    if (typeof j.id !== "string" || typeof j.title !== "string" || typeof j.company_name !== "string") continue;

    const locations = Array.isArray(j.locations)
      ? (j.locations as unknown[]).filter((l): l is string => typeof l === "string")
      : [];

    out.push({
      externalId: `${src.externalIdPrefix}:${j.id}`,
      company: j.company_name,
      title: j.title,
      location: locations.length ? locations.join(" · ") : null,
      url: typeof j.url === "string" && j.url ? j.url : null,
      descriptionText: "",
      descriptionHtml: "",
      postedAt: typeof j.date_posted === "number" ? new Date(j.date_posted * 1000) : null,
      salary: null,
      active: j.active !== false,
      employmentType: src.employmentType,
      level: src.level,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/aggregator.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/aggregator.ts src/lib/jobs/aggregator.test.ts
git commit -m "feat(jobs): aggregator source config + listings.json parser"
```

---

### Task 5: `fetchAggregator` (network, injectable fetch)

**Files:**
- Modify: `src/lib/jobs/aggregator.ts`
- Test: `src/lib/jobs/aggregator.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/jobs/aggregator.test.ts`:

```ts
import { fetchAggregator } from "./aggregator";

describe("fetchAggregator", () => {
  const SRC: AggregatorSource = {
    name: "t", url: "https://example/listings.json",
    employmentType: "fulltime", level: "junior", externalIdPrefix: "simplify:newgrad",
  };

  it("parses a 200 JSON body", async () => {
    const body = [{ id: "a", company_name: "C", title: "T", locations: ["NYC"], url: "u", date_posted: 1, is_visible: true, active: true }];
    const fetchFn = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
    const jobs = await fetchAggregator(SRC, { fetchFn });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].externalId).toBe("simplify:newgrad:a");
  });

  it("returns [] on non-200 (e.g. 404 for a not-yet-created repo)", async () => {
    const fetchFn = (async () => new Response("Not Found", { status: 404 })) as unknown as typeof fetch;
    expect(await fetchAggregator(SRC, { fetchFn })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/aggregator.test.ts`
Expected: FAIL with "fetchAggregator is not a function".

- [ ] **Step 3: Implement**

Append to `src/lib/jobs/aggregator.ts`:

```ts
export async function fetchAggregator(
  src: AggregatorSource,
  opts: { fetchFn?: typeof fetch } = {}
): Promise<AggregatorJob[]> {
  const f = opts.fetchFn ?? fetch;
  const res = await f(src.url, { headers: { "User-Agent": AGGREGATOR_USER_AGENT } });
  if (!res.ok) return [];
  const raw = await res.json();
  return parseListings(raw, src);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/aggregator.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/aggregator.ts src/lib/jobs/aggregator.test.ts
git commit -m "feat(jobs): fetchAggregator with injectable fetch, tolerant of 404"
```

---

### Task 6: Wire aggregator + loud failures into the poller

**Files:**
- Modify: `src/trigger/poll-jobs.ts`

This adds aggregator ingestion (with ATS-preferred URL dedup), per-board logging, and sets `employmentType`/`active` on ATS upserts. ATS upserts also backfill `employmentType` on existing rows when the poll re-runs.

- [ ] **Step 1: Replace the poller body**

Replace the entire contents of `src/trigger/poll-jobs.ts` with:

```ts
import { schedules } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { BOARDS } from "@/lib/jobs/boards.config";
import { fetchBoard } from "@/lib/jobs/fetchers";
import { enrichJob } from "@/lib/jobs/enrich";
import { AGGREGATOR_SOURCES, fetchAggregator } from "@/lib/jobs/aggregator";
import { normalizeUrl } from "@/lib/jobs/url";

export const pollJobs = schedules.task({
  id: "poll-jobs",
  cron: "0 * * * *", // hourly
  run: async () => {
    let upserts = 0;

    // ── ATS boards ──────────────────────────────────────────────────────────
    for (const cfg of BOARDS) {
      const jobs = await fetchBoard(cfg).catch((err) => {
        console.warn(`[poll-jobs] ATS fetch threw for ${cfg.provider}:${cfg.slug}`, err);
        return [];
      });
      if (jobs.length === 0) {
        console.warn(`[poll-jobs] 0 jobs from ${cfg.provider}:${cfg.slug} (${cfg.company}) — check slug`);
      } else {
        console.log(`[poll-jobs] ${cfg.provider}:${cfg.slug} → ${jobs.length} jobs`);
      }
      for (const j of jobs) {
        const e = enrichJob({ title: j.title, location: j.location, descriptionText: j.descriptionText, salary: j.salary });
        await prisma.job.upsert({
          where: { source_externalId: { source: "ats", externalId: j.externalId } },
          create: {
            source: "ats", externalId: j.externalId, company: j.company, title: j.title,
            location: j.location, url: j.url, descriptionText: j.descriptionText, descriptionHtml: j.descriptionHtml,
            postedAt: j.postedAt, salary: j.salary, country: e.country, isRemote: e.isRemote,
            roleCategory: e.roleCategory, level: e.level, techTags: e.techTags,
            salaryMin: e.salaryMin, salaryMax: e.salaryMax, employmentType: e.employmentType, active: true,
          },
          update: {
            title: j.title, location: j.location, url: j.url, descriptionText: j.descriptionText,
            descriptionHtml: j.descriptionHtml, postedAt: j.postedAt, salary: j.salary, country: e.country,
            isRemote: e.isRemote, roleCategory: e.roleCategory, level: e.level, techTags: e.techTags,
            salaryMin: e.salaryMin, salaryMax: e.salaryMax, employmentType: e.employmentType, active: true,
          },
        });
        upserts++;
      }
    }

    // ── Aggregator lists ────────────────────────────────────────────────────
    // Prefer direct ATS records: skip an aggregator job whose URL matches an ATS job.
    const atsRows = await prisma.job.findMany({ where: { source: "ats" }, select: { url: true } });
    const atsUrls = new Set(atsRows.map((r) => normalizeUrl(r.url)).filter((u): u is string => u !== null));

    for (const src of AGGREGATOR_SOURCES) {
      const jobs = await fetchAggregator(src).catch((err) => {
        console.warn(`[poll-jobs] aggregator fetch threw for ${src.name}`, err);
        return [];
      });
      if (jobs.length === 0) {
        console.warn(`[poll-jobs] 0 jobs from aggregator ${src.name} — source may be down or not yet created`);
      } else {
        console.log(`[poll-jobs] aggregator ${src.name} → ${jobs.length} jobs`);
      }
      for (const j of jobs) {
        const norm = normalizeUrl(j.url);
        if (norm && atsUrls.has(norm)) continue; // dedup: ATS record wins
        const e = enrichJob({ title: j.title, location: j.location, descriptionText: "", salary: null });
        await prisma.job.upsert({
          where: { source_externalId: { source: "aggregator", externalId: j.externalId } },
          create: {
            source: "aggregator", externalId: j.externalId, company: j.company, title: j.title,
            location: j.location, url: j.url, descriptionText: "", descriptionHtml: "",
            postedAt: j.postedAt, salary: null, country: e.country, isRemote: e.isRemote,
            roleCategory: e.roleCategory, level: j.level, techTags: e.techTags,
            salaryMin: null, salaryMax: null, employmentType: j.employmentType, active: j.active,
          },
          update: {
            title: j.title, location: j.location, url: j.url, postedAt: j.postedAt,
            country: e.country, isRemote: e.isRemote, roleCategory: e.roleCategory, level: j.level,
            techTags: e.techTags, employmentType: j.employmentType, active: j.active,
          },
        });
        upserts++;
      }
    }

    return { upserts };
  },
});
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/trigger/poll-jobs.ts
git commit -m "feat(jobs): ingest aggregator lists + loud per-board logging in poller"
```

---

### Task 7: Fix dead slugs + expand the ATS roster

**Files:**
- Create: `scripts/probe-boards.ts` (temporary diagnostic)
- Modify: `src/lib/jobs/boards.config.ts`

- [ ] **Step 1: Write a probe script**

Create `scripts/probe-boards.ts`:

```ts
import { BOARDS } from "@/lib/jobs/boards.config";
import { fetchBoard } from "@/lib/jobs/fetchers";

async function main() {
  for (const cfg of BOARDS) {
    const n = await fetchBoard(cfg).then((j) => j.length).catch(() => -1);
    const flag = n <= 0 ? "  <<< DEAD" : "";
    console.log(`${cfg.provider.padEnd(11)} ${cfg.slug.padEnd(16)} ${String(n).padStart(4)}${flag}`);
  }
}
main();
```

- [ ] **Step 2: Run it to identify dead slugs**

Run: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/probe-boards.ts`
Expected: a table; note every row flagged `<<< DEAD` (returns 0 or errors). From the current DB only 25 of 40 companies have jobs, so expect ~15 dead — the Ashby cluster especially.

- [ ] **Step 3: Repair dead slugs and expand the roster**

For each dead slug, find the correct public board identifier and fix it. Verification URLs per provider (open in a browser or `curl`; a JSON array/`{jobs:[...]}` with entries means the slug is valid):
- Greenhouse: `https://boards-api.greenhouse.io/v1/boards/<slug>/jobs`
- Lever: `https://api.lever.co/v0/postings/<slug>?mode=json`
- Ashby: `https://api.ashbyhq.com/posting-api/job-board/<slug>`

Then grow `src/lib/jobs/boards.config.ts` toward ~150 big-name / competitive-comp employers. Add only slugs you verified return >0 jobs. Keep the existing `BoardConfig` shape and the provider section comments. Example additions to verify and add (confirm each before committing):

```ts
  // Greenhouse (verify each at the URL above before adding)
  { provider: "greenhouse", slug: "doordash", company: "DoorDash" },
  { provider: "greenhouse", slug: "snowflake", company: "Snowflake" },
  { provider: "greenhouse", slug: "plaid", company: "Plaid" },
  { provider: "greenhouse", slug: "benchling", company: "Benchling" },
  { provider: "greenhouse", slug: "nuro", company: "Nuro" },
  // Ashby
  { provider: "ashby", slug: "notion", company: "Notion" },
  { provider: "ashby", slug: "vercel", company: "Vercel" },
  { provider: "ashby", slug: "mercor", company: "Mercor" },
```

Update the validation comment at the top of the file to the current date.

- [ ] **Step 4: Re-run the probe to confirm zero dead slugs**

Run: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/probe-boards.ts`
Expected: no `<<< DEAD` rows.

- [ ] **Step 5: Remove the probe script and commit**

```bash
rm scripts/probe-boards.ts
git add src/lib/jobs/boards.config.ts
git commit -m "fix(jobs): repair dead board slugs and expand roster to ~150 companies"
```

---

### Task 8: Default filter — entry-level full-time, aggregator source, active only

**Files:**
- Modify: `src/lib/jobs/filters.ts`
- Test: `src/lib/jobs/filters.test.ts`

- [ ] **Step 1: Update the tests**

In `src/lib/jobs/filters.test.ts`, replace the first two tests (`base: ...` and `defaults to entry-level ...`) and add internship coverage. Replace lines 7–19 (the two `it(...)` blocks) with:

```ts
  it("base: ats+aggregator, active, CS roles, US-or-ambiguous-remote", () => {
    const where = buildJobWhere({}, USER);
    expect(where).toMatchObject({
      source: { in: ["ats", "aggregator"] },
      active: true,
      roleCategory: { in: expect.arrayContaining(["frontend", "backend"]) },
      OR: [{ country: "US" }, { AND: [{ isRemote: true }, { country: null }] }],
    });
  });

  it("defaults to entry-level full-time when no level param", () => {
    const where = buildJobWhere({}, USER);
    expect(where.AND).toContainEqual({ level: "junior" });
    expect(where.AND).toContainEqual({ employmentType: "fulltime" });
  });

  it("level=intern filters internships by employmentType", () => {
    const where = buildJobWhere({ level: "intern" }, USER);
    expect(where.AND).toContainEqual({ employmentType: "internship" });
    expect((where.AND as Array<Record<string, unknown>>).some((c) => "level" in c)).toBe(false);
  });
```

Also delete the now-invalid `level=senior` test (lines 27–30 originally) since the audience chip no longer supports senior; the `level=all` test stays valid.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/jobs/filters.test.ts`
Expected: FAIL (source is currently `"ats"` not `{in:[...]}`, no `active`, no `employmentType`).

- [ ] **Step 3: Update the filter builder**

In `src/lib/jobs/filters.ts`, change the `base` object (lines 50–57):

```ts
  const base: Prisma.JobWhereInput = {
    source: { in: ["ats", "aggregator"] },
    active: true,
    roleCategory: { in: [...CS_ROLE_CATEGORIES] },
    OR: [
      { country: "US" },
      { AND: [{ isRemote: true }, { country: null }] },
    ],
  };
```

Replace the level block (lines 85–93) with the 3-way audience logic:

```ts
  // Audience (reuses the `level` URL param): default = new-grad full-time;
  // "intern" = internships; "all" = no level/type filter.
  const audience = params.level;
  if (audience === "all") {
    // everything
  } else if (audience === "intern") {
    conditions.push({ employmentType: "internship" });
  } else {
    conditions.push({ level: "junior" });
    conditions.push({ employmentType: "fulltime" });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/jobs/filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/filters.ts src/lib/jobs/filters.test.ts
git commit -m "feat(jobs): default feed to entry-level full-time across ats+aggregator, active only"
```

---

### Task 9: Backfill + verify the funnel

**Files:**
- Create: `scripts/funnel.ts` (permanent diagnostic)

- [ ] **Step 1: Add a funnel diagnostic script**

Create `scripts/funnel.ts`:

```ts
import { prisma as p } from "@/lib/db";
const CS = ["frontend","backend","fullstack","mobile","ml-ai","data","devops","security","qa"];
async function main() {
  const total = await p.job.count();
  const base = { source: { in: ["ats","aggregator"] as const }, active: true,
    roleCategory: { in: CS }, OR: [{ country: "US" }, { AND: [{ isRemote: true }, { country: null }] }] };
  const newgradFT = await p.job.count({ where: { ...base, level: "junior", employmentType: "fulltime" } });
  const interns = await p.job.count({ where: { ...base, employmentType: "internship" } });
  const bySource = await p.job.groupBy({ by: ["source"], _count: true });
  console.log("TOTAL:", total);
  bySource.forEach((s) => console.log("  source", s.source, s._count));
  console.log("DEFAULT FEED (new-grad full-time):", newgradFT);
  console.log("Internships available:", interns);
}
main().finally(() => p.$disconnect());
```

- [ ] **Step 2: Run the poller to ingest aggregator data + backfill employmentType**

Run: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/run-poll.ts`
Expected: console shows per-board counts, aggregator counts (e.g. "Simplify New-Grad → N jobs"), and a final upsert total. Note: `scripts/run-poll.ts` must call the same logic as the trigger task — if it imports `BOARDS`/`fetchBoard` directly it also needs the aggregator block; update it to mirror `poll-jobs.ts` if it doesn't already.

- [ ] **Step 3: Run the funnel**

Run: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/funnel.ts`
Expected: `source aggregator` has hundreds+ of rows; `DEFAULT FEED (new-grad full-time)` is in the hundreds+ (vs 33 before). If still low, re-check Task 8's filter and that aggregator rows have `country` US/remote (many aggregator locations are US cities the parser recognizes).

- [ ] **Step 4: Commit**

```bash
git add scripts/funnel.ts scripts/run-poll.ts
git commit -m "chore(jobs): funnel diagnostic + backfill via poll"
```

---

## Phase 2 — Flat feed UI

### Task 10: Flat default feed query in the page

**Files:**
- Modify: `src/app/(app)/jobs/page.tsx`

- [ ] **Step 1: Replace the default (non-saved) branch with a flat query**

In `src/app/(app)/jobs/page.tsx`, remove the grouped imports (lines 6 and 11):

```ts
// DELETE these two imports:
import { getCompanyFeedPage } from "@/lib/jobs/grouped";
import { type BrowserGroup } from "@/components/company-group";
```

Replace the default branch (lines 67–85, everything after the `if (isSavedView) { ... }` block) with:

```ts
  const where = buildJobWhere(params, user.id);
  const [rows, totalCount] = await Promise.all([
    prisma.job.findMany({ where, orderBy: jobOrderBy(params.sort), take: JOBS_PAGE_SIZE, select: JOB_LIST_SELECT }),
    prisma.job.count({ where }),
  ]);
  const initialJobs = rows.map(toBrowserJob);
  const initialCursor = rows.length === JOBS_PAGE_SIZE ? rows[rows.length - 1].id : null;

  return (
    <div className="max-w-6xl">
      <JobsHeader savedCount={savedSet.size} totalCount={totalCount} isSavedView={false} filterKeys={filterKeys} />
      <div className="flex flex-col gap-3 mb-4">
        <JobSearchBar />
        <JobFilterChips />
      </div>
      <JobsBrowser initialJobs={initialJobs} initialCursor={initialCursor} savedIds={[...savedSet]} hasFilters={filterKeys.length > 0} />
    </div>
  );
```

Update the header copy on line 25:

```tsx
        <p className="text-muted-foreground mt-1">New-grad &amp; entry-level US software roles.</p>
```

- [ ] **Step 2: Verify type-check (will still error until Task 11 updates JobsBrowser props)**

Run: `npx tsc --noEmit`
Expected: errors only about `JobsBrowser` no longer accepting `initialGroups`/`hasMoreCompanies` are fine to resolve in Task 11; there should be NO error about `getCompanyFeedPage`/`BrowserGroup` (those imports are gone). If other errors appear, fix them now.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/jobs/page.tsx"
git commit -m "feat(jobs): flat default feed query (drops company grouping)"
```

---

### Task 11: JobsBrowser — flat list + infinite scroll, grouping removed

**Files:**
- Modify: `src/components/jobs-browser.tsx`

- [ ] **Step 1: Replace the component with the flat-only version**

Replace the entire contents of `src/components/jobs-browser.tsx` with:

```tsx
// src/components/jobs-browser.tsx
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobListItem } from "@/components/job-list-item";
import { JobDetailPane, type JobDetailData } from "@/components/job-detail-pane";
import { loadMoreJobs, getJobDetail } from "@/lib/jobs/actions";
import { toBrowserJob, type BrowserJob } from "@/components/job-browser-types";

export { toBrowserJob, type BrowserJob };

function toDetail(j: BrowserJob): JobDetailData {
  return {
    id: j.id, title: j.title, company: j.company, location: j.location,
    salary: j.salary, url: j.url, descriptionText: j.descriptionText,
    descriptionHtml: j.descriptionHtml,
  };
}

export function JobsBrowser({
  savedView, initialJobs, initialCursor, savedIds, hasFilters,
}: {
  savedView?: boolean;
  initialJobs?: BrowserJob[];
  initialCursor?: string | null;
  savedIds: string[];
  hasFilters: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const saved = useMemo(() => new Set(savedIds), [savedIds]);

  const [jobs, setJobs] = useState<BrowserJob[]>(initialJobs ?? []);
  const [cursor, setCursor] = useState(initialCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [rolesById, setRolesById] = useState<Map<string, BrowserJob>>(() => {
    const m = new Map<string, BrowserJob>();
    (initialJobs ?? []).forEach((j) => m.set(j.id, j));
    return m;
  });

  const registerRoles = useCallback((rows: BrowserJob[]) => {
    setRolesById((prev) => {
      const m = new Map(prev);
      rows.forEach((j) => m.set(j.id, j));
      return m;
    });
  }, []);

  const fetchedRef = useRef<string | null>(null);

  const flatParams = useMemo(() => {
    const f: Record<string, string | undefined> = {};
    sp.forEach((v, k) => { if (k !== "selected") f[k] = v; });
    return f;
  }, [sp]);

  const firstId = jobs[0]?.id;
  const explicitSelected = sp.get("selected");
  const selectedId = explicitSelected ?? firstId ?? null;
  const selectedJob = selectedId ? rolesById.get(selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !rolesById.has(selectedId) && fetchedRef.current !== selectedId) {
      fetchedRef.current = selectedId;
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

  const moreJobs = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    const res = await loadMoreJobs(flatParams, cursor);
    const mapped = res.jobs.map(toBrowserJob);
    setJobs((p) => [...p, ...mapped]);
    registerRoles(mapped);
    setCursor(res.nextCursor);
    setLoading(false);
  }, [cursor, loading, flatParams, registerRoles]);

  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) moreJobs();
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, moreJobs]);

  if (jobs.length === 0) {
    if (savedView) {
      return <EmptyState title="No saved jobs yet" message="Tap the ☆ on a job to bookmark it and find it here." />;
    }
    return (
      <EmptyState
        title={hasFilters ? "No jobs match your filters" : "No roles right now"}
        message={hasFilters ? `Try widening your filters, or switch the audience chip to "All roles."` : `Switch the audience chip to "All roles" to see more.`}
      />
    );
  }

  const detail: JobDetailData | null = selectedJob ? toDetail(selectedJob) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border border-border rounded-lg overflow-hidden h-[calc(100vh-220px)]">
      <div className={`${explicitSelected ? "hidden md:flex" : "flex"} flex-col overflow-y-auto border-r border-border min-h-0`}>
        {jobs.map((job) => (
          <JobListItem key={job.id} job={job} selected={job.id === selectedId} saved={saved.has(job.id)} onSelect={() => select(job.id)} />
        ))}
        {cursor && (
          <div ref={sentinelRef} className="p-3">
            <Button variant="outline" size="sm" onClick={moreJobs} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more"}
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

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS (page.tsx and JobsBrowser now agree; grouped code is unreferenced from the feed). Any remaining errors will be in `actions.ts`/`grouped.ts` cleanup handled in Task 13.

- [ ] **Step 3: Commit**

```bash
git add src/components/jobs-browser.tsx
git commit -m "feat(jobs): flat infinite-scroll feed, remove company grouping from browser"
```

---

### Task 12: Audience chip (New grad / Internships / All roles)

**Files:**
- Modify: `src/components/job-filter-chips.tsx`

- [ ] **Step 1: Replace LEVEL_OPTIONS with the 3-way audience options**

In `src/components/job-filter-chips.tsx`, replace the `LEVEL_OPTIONS` block (lines 16–20) with:

```ts
const LEVEL_OPTIONS = [
  ["", "New grad"], ["intern", "Internships"], ["all", "All roles"],
] as const;
```

No other change is needed — the chip already renders via `Chip name="level" options={LEVEL_OPTIONS} ...` (line 78) and the `level` URL param is consumed by the updated filter in Task 8.

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/job-filter-chips.tsx
git commit -m "feat(jobs): collapse level filter into a 3-way audience chip"
```

---

### Task 13: Retire the company-grouped code path

**Files:**
- Delete: `src/lib/jobs/grouped.ts`, `src/lib/jobs/grouped.test.ts`, `src/components/company-group.tsx`
- Modify: `src/lib/jobs/actions.ts`

- [ ] **Step 1: Remove grouped server actions**

In `src/lib/jobs/actions.ts`, delete the `loadCompanyRoles` (lines 30–43) and `loadMoreCompanies` (lines 45–51) functions, and remove the grouped import on line 8:

```ts
// DELETE this import:
import { getCompanyFeedPage, type CompanyGroup } from "@/lib/jobs/grouped";
```

Keep `loadMoreJobs` and `getJobDetail`.

- [ ] **Step 2: Delete the retired files**

```bash
git rm src/lib/jobs/grouped.ts src/lib/jobs/grouped.test.ts src/components/company-group.tsx
```

- [ ] **Step 3: Confirm nothing else references them**

Run: `grep -rn "grouped\|company-group\|CompanyGroup\|loadMoreCompanies\|loadCompanyRoles\|getCompanyFeedPage" src/ ; echo "exit: $?"`
Expected: no matches (grep exit 1). If any file still imports them, remove the reference.

- [ ] **Step 4: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(jobs): retire company-grouped feed path"
```

---

### Task 14: Gate resume-matching on jobs with no description

Aggregator jobs have empty descriptions; matching a resume against "" yields a meaningless score. Hide the match action for those.

**Files:**
- Modify: `src/components/job-detail-pane.tsx`
- Modify: `src/components/match-button.tsx`

- [ ] **Step 1: Pass description availability into MatchButton**

In `src/components/job-detail-pane.tsx`, change the `MatchButton` usage (line 55) to:

```tsx
      <MatchButton jobId={job.id} hasDescription={Boolean(job.descriptionHtml || job.descriptionText?.trim())} />
```

- [ ] **Step 2: Honor the prop in MatchButton**

In `src/components/match-button.tsx`, update the signature and early-return when there's no description. Replace the function signature line (line 6):

```tsx
export function MatchButton({ jobId, hasDescription }: { jobId: string; hasDescription: boolean }) {
```

And immediately after the `const [error, ...]` state declarations (after line 9), add:

```tsx
  if (!hasDescription) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Resume matching isn’t available for this listing — open the original posting to read the full description.
      </p>
    );
  }
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS (all suites, including the updated `filters.test.ts`, new `enrich`/`url`/`aggregator` suites; no references to the deleted `grouped.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/components/job-detail-pane.tsx src/components/match-button.tsx
git commit -m "feat(jobs): hide resume matching for descriptionless aggregator jobs"
```

---

### Task 15: End-to-end smoke check

**Files:**
- Reference: `e2e/jobs.spec.ts`

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (serves on port 3050)

- [ ] **Step 2: Manually verify the feed**

Open `http://localhost:3050/jobs` and confirm:
- A flat, newest-first list of individual roles (no company group headers).
- Default shows new-grad / entry-level full-time roles; the count in the header is in the hundreds+.
- The audience chip switches between "New grad", "Internships", "All roles" and the list updates.
- Scrolling to the bottom auto-loads more (infinite scroll), and "Load more" still works as a fallback.
- Clicking a role opens the detail pane; an aggregator role shows "No description provided — View original ↗" and no "Match my resume" button; an ATS role shows full description + salary + match button.

- [ ] **Step 3: Run the existing e2e suite**

Run: `npm run e2e -- jobs.spec.ts`
Expected: PASS. If `e2e/jobs.spec.ts` asserts on company-group markup, update those assertions to the flat-list markup (it now renders `JobListItem` rows directly). Re-run until green.

- [ ] **Step 4: Commit any e2e updates**

```bash
git add e2e/jobs.spec.ts
git commit -m "test(jobs): update e2e for flat feed"
```

---

## Self-review notes

- **Spec coverage:** schema (T1), employmentType classifier (T2), dedup/url (T3), aggregator config+parser+fetcher (T4–T5), poller integration + loud failures (T6), dead-slug fix + roster expansion (T7), default filter (T8), backfill+verify (T9), flat feed query+UI+infinite scroll (T10–T11), audience chip (T12), retire grouping (T13), descriptionless match gating (T14), e2e (T15). Compliance/rate-limiting realized via the `User-Agent` in T4 and the public-API-only sourcing; no scraping of protected sites.
- **Dropped from spec after data inspection:** the `swe` role-classifier fallback (the `other` bucket is genuinely non-engineering) and the sponsorship field/filter (out of scope).
- **Known limitation carried forward:** aggregator jobs have no salary/description; the feed is intentionally a mix of rich ATS rows and lightweight aggregator rows.
