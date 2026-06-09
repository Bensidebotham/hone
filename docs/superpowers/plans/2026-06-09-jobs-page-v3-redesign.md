# Jobs Page v3 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Jobs page into a LinkedIn/Indeed-style two-pane experience with keyword search, CS-focused facets, company logos, a hard US-only filter, and inline job detail — and remove the manual "Paste a Job" feature.

**Architecture:** Heuristic enrichment runs at ATS ingest, deriving structured columns (`country`, `isRemote`, `roleCategory`, `level`, `techTags`, `salaryMin`, `salaryMax`) on each `Job`. The query layer filters on those columns (US-or-remote base filter + facets) and paginates by cursor. The UI is a client two-pane browser whose selected job is driven by a `?selected=<id>` URL param.

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + Postgres (Neon), Trigger.dev (poll-jobs), Vitest, Playwright, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-09-jobs-page-v3-redesign-design.md`

---

## File Structure

**Create:**
- `src/lib/jobs/enrich.data.ts` — dictionaries (US state codes/names, US cities, role keyword rules, tech terms)
- `src/lib/jobs/enrich.ts` — pure classifiers + `enrichJob()`
- `src/lib/jobs/enrich.test.ts` — unit tests for enrichment
- `src/lib/jobs/actions.ts` — `loadMoreJobs` server action (cursor pagination)
- `src/lib/companies/logo.ts` — `companyDomain()` + `monogramColor()`
- `src/lib/companies/logo.test.ts` — unit tests
- `src/components/company-logo.tsx` — logo `<img>` with monogram fallback
- `src/components/job-search-bar.tsx` — keyword + location search
- `src/components/job-filter-chips.tsx` — live facet chips
- `src/components/job-list-item.tsx` — left-pane row
- `src/components/job-detail-pane.tsx` — right-pane detail
- `src/components/jobs-browser.tsx` — two-pane container, selection + load-more
- `scripts/backfill-enrichment.ts` — one-off backfill
- `e2e/jobs.spec.ts` — Playwright spec

**Modify:**
- `src/lib/jobs/salary.ts` — add numeric `parseSalaryRange()` (refactor shared matcher)
- `src/lib/jobs/salary.test.ts` — add range cases
- `prisma/schema.prisma` — new `Job` columns + indexes
- `src/trigger/poll-jobs.ts` — call `enrichJob()` in upsert
- `src/lib/jobs/filters.ts` — new params + US base filter
- `src/lib/jobs/filters.test.ts` — new filter cases
- `src/app/(app)/jobs/page.tsx` — render `<JobsBrowser>`, drop paste card

**Delete:**
- `src/components/paste-job-form.tsx`
- `src/app/api/jobs/paste/route.ts`
- `src/app/api/jobs/paste/route.test.ts`
- `src/components/job-filter-bar.tsx` (replaced by search bar + chips)

---

## Task 1: Numeric salary range parsing

Add a `parseSalaryRange()` that returns annualized USD integer bounds, reusing the existing regex logic. Refactor the core match out of `parseSalary` so both share one code path (DRY).

**Files:**
- Modify: `src/lib/jobs/salary.ts`
- Test: `src/lib/jobs/salary.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/jobs/salary.test.ts`, extend the existing import line to also pull in `parseSalaryRange`:

```ts
// change the existing import from:
//   import { parseSalary } from "@/lib/jobs/salary";
// to:
import { parseSalary, parseSalaryRange } from "@/lib/jobs/salary";
```

Then add the new describe block:

```ts
describe("parseSalaryRange", () => {
  it("parses a dollar-K range to annualized USD ints", () => {
    expect(parseSalaryRange("$120k – $150k")).toEqual({
      salaryMin: 120000,
      salaryMax: 150000,
    });
  });
  it("parses a full-dollar range", () => {
    expect(parseSalaryRange("$120,000 to $150,000")).toEqual({
      salaryMin: 120000,
      salaryMax: 150000,
    });
  });
  it("parses a single value as equal min/max", () => {
    expect(parseSalaryRange("$150,000")).toEqual({
      salaryMin: 150000,
      salaryMax: 150000,
    });
  });
  it("returns null bounds when nothing parseable", () => {
    expect(parseSalaryRange("competitive salary")).toEqual({
      salaryMin: null,
      salaryMax: null,
    });
  });
  it("returns null bounds for empty input", () => {
    expect(parseSalaryRange(null)).toEqual({ salaryMin: null, salaryMax: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/salary.test.ts`
Expected: FAIL — `parseSalaryRange is not a function`.

- [ ] **Step 3: Refactor the shared matcher and add `parseSalaryRange`**

In `src/lib/jobs/salary.ts`, add a private matcher that returns K bounds, then rewrite `parseSalary` to use it and add `parseSalaryRange`. Insert after the `fmtK` helper (around line 67) and replace the body of `parseSalary`:

```ts
export interface SalaryRange {
  salaryMin: number | null;
  salaryMax: number | null;
}

/**
 * Core matcher: returns lo/hi in K (thousands), or null if no salary found.
 * Shared by parseSalary (string output) and parseSalaryRange (numeric output).
 */
function matchSalaryK(text: string | null | undefined): { lo: number; hi: number } | null {
  if (!text) return null;
  const m = COMBINED.exec(text);
  if (!m) return null;
  const [, g1, g2, g3, g4, g5, g6, g7, g8, g9, g10, g11] = m;

  if (g1 !== undefined && g2 !== undefined && g3 !== undefined && g4 !== undefined) {
    const lo = fullToK(g1, g2);
    const hi = fullToK(g3, g4);
    return lo < MIN_K ? null : { lo, hi };
  }
  if (g5 !== undefined && g6 !== undefined) {
    const lo = toK(g5);
    const hi = toK(g6);
    return lo < MIN_K ? null : { lo, hi };
  }
  if (g7 !== undefined && g8 !== undefined) {
    const lo = toK(g7);
    const hi = toK(g8);
    return lo < MIN_K ? null : { lo, hi };
  }
  if (g9 !== undefined && g10 !== undefined) {
    const k = fullToK(g9, g10);
    return k < MIN_K ? null : { lo: k, hi: k };
  }
  if (g11 !== undefined) {
    const k = toK(g11);
    return k < MIN_K ? null : { lo: k, hi: k };
  }
  return null;
}

export function parseSalaryRange(text: string | null | undefined): SalaryRange {
  const r = matchSalaryK(text);
  if (!r) return { salaryMin: null, salaryMax: null };
  return { salaryMin: r.lo * 1000, salaryMax: r.hi * 1000 };
}
```

Then replace the existing `parseSalary` body (lines ~71-121) with:

```ts
export function parseSalary(text: string | null | undefined): string | null {
  const r = matchSalaryK(text);
  if (!r) return null;
  return r.lo === r.hi ? fmtK(r.lo) : `${fmtK(r.lo)}–${fmtK(r.hi)}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/jobs/salary.test.ts`
Expected: PASS — both the new `parseSalaryRange` cases and the existing `parseSalary` cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/salary.ts src/lib/jobs/salary.test.ts
git commit -m "feat(jobs): add numeric parseSalaryRange via shared matcher"
```

---

## Task 2: Enrichment dictionaries

Create the constant data file the classifiers depend on. No logic here — just data, so it can grow without touching tested code.

**Files:**
- Create: `src/lib/jobs/enrich.data.ts`

- [ ] **Step 1: Create the dictionaries**

```ts
// src/lib/jobs/enrich.data.ts
// Data-only module for heuristic job enrichment. Extend freely — logic lives in enrich.ts.

export const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

export const US_STATE_NAMES = new Set([
  "alabama","alaska","arizona","arkansas","california","colorado","connecticut",
  "delaware","florida","georgia","hawaii","idaho","illinois","indiana","iowa",
  "kansas","kentucky","louisiana","maine","maryland","massachusetts","michigan",
  "minnesota","mississippi","missouri","montana","nebraska","nevada",
  "new hampshire","new jersey","new mexico","new york","north carolina",
  "north dakota","ohio","oklahoma","oregon","pennsylvania","rhode island",
  "south carolina","south dakota","tennessee","texas","utah","vermont",
  "virginia","washington","west virginia","wisconsin","wyoming",
]);

// Major US cities that frequently appear without a state qualifier.
export const US_CITIES = new Set([
  "new york","san francisco","los angeles","seattle","boston","austin",
  "chicago","denver","atlanta","dallas","houston","miami","san diego",
  "san jose","portland","philadelphia","washington","minneapolis",
  "salt lake city","nashville","raleigh","pittsburgh","brooklyn","palo alto",
  "mountain view","sunnyvale","cambridge","bellevue","santa monica",
]);

// Explicit US markers.
export const US_MARKERS = ["united states", "u.s.a", "u.s.", " usa", "(usa)", ", us"];

// Ordered role rules — first match wins. Each entry: [category, keywords].
export const ROLE_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["mobile", ["ios engineer", "android engineer", "mobile engineer", "ios developer", "android developer"]],
  ["ml-ai", ["machine learning", "ml engineer", "ai engineer", "deep learning", "nlp", "computer vision", "research scientist"]],
  ["data", ["data engineer", "data scientist", "data analyst", "analytics engineer", "bi engineer"]],
  ["devops", ["devops", "site reliability", "sre", "platform engineer", "infrastructure engineer", "cloud engineer"]],
  ["security", ["security engineer", "appsec", "application security", "infosec", "security analyst"]],
  ["qa", ["qa engineer", "quality assurance", "test engineer", "sdet", "automation engineer"]],
  ["frontend", ["frontend", "front end", "front-end", "ui engineer", "react engineer"]],
  ["backend", ["backend", "back end", "back-end", "server engineer"]],
  ["fullstack", ["full stack", "fullstack", "full-stack", "software engineer", "software developer", "swe", "developer", "programmer", "engineer"]],
];

// Ordered level rules — first match wins.
export const LEVEL_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["intern", ["intern", "internship", "co-op"]],
  ["staff", ["staff", "principal"]],
  ["lead", ["lead", "tech lead"]],
  ["manager", ["manager", "director", "head of", "vp ", "vice president"]],
  ["senior", ["senior", "sr.", "sr ", "snr"]],
  ["junior", ["junior", "jr.", "jr ", "entry level", "entry-level", "new grad", "graduate"]],
];

// Canonical tech term -> regex source matched against title+description.
// Order does not matter; results are deduped and sorted by appearance.
export const TECH_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["React", "\\breact\\b"],
  ["React Native", "\\breact native\\b"],
  ["Angular", "\\bangular\\b"],
  ["Vue", "\\bvue(?:\\.js)?\\b"],
  ["Svelte", "\\bsvelte\\b"],
  ["TypeScript", "\\btypescript\\b"],
  ["JavaScript", "\\bjavascript\\b"],
  ["Node.js", "\\bnode(?:\\.js|js)?\\b"],
  ["Python", "\\bpython\\b"],
  ["Java", "\\bjava\\b"],
  ["Go", "\\b(?:golang|go)\\b"],
  ["Rust", "\\brust\\b"],
  ["Ruby", "\\bruby\\b"],
  ["Rails", "\\brails\\b"],
  ["C++", "c\\+\\+"],
  ["C#", "c#"],
  ["Kotlin", "\\bkotlin\\b"],
  ["Swift", "\\bswift\\b"],
  ["PHP", "\\bphp\\b"],
  ["Scala", "\\bscala\\b"],
  ["Django", "\\bdjango\\b"],
  ["Flask", "\\bflask\\b"],
  ["FastAPI", "\\bfastapi\\b"],
  ["Spring", "\\bspring\\b"],
  ["GraphQL", "\\bgraphql\\b"],
  ["PostgreSQL", "\\b(?:postgresql|postgres)\\b"],
  ["MySQL", "\\bmysql\\b"],
  ["MongoDB", "\\bmongodb\\b"],
  ["Redis", "\\bredis\\b"],
  ["Kafka", "\\bkafka\\b"],
  ["AWS", "\\baws\\b"],
  ["GCP", "\\b(?:gcp|google cloud)\\b"],
  ["Azure", "\\bazure\\b"],
  ["Docker", "\\bdocker\\b"],
  ["Kubernetes", "\\b(?:kubernetes|k8s)\\b"],
  ["Terraform", "\\bterraform\\b"],
  ["TensorFlow", "\\btensorflow\\b"],
  ["PyTorch", "\\bpytorch\\b"],
];
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/jobs/enrich.data.ts
git commit -m "feat(jobs): add enrichment dictionaries"
```

---

## Task 3: `parseLocation` classifier

**Files:**
- Create: `src/lib/jobs/enrich.ts`
- Test: `src/lib/jobs/enrich.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/jobs/enrich.test.ts
import { describe, it, expect } from "vitest";
import { parseLocation } from "./enrich";

describe("parseLocation", () => {
  it("detects US from a state code", () => {
    expect(parseLocation("New York, NY")).toEqual({ country: "US", isRemote: false });
  });
  it("detects US from a known city without state", () => {
    expect(parseLocation("San Francisco")).toEqual({ country: "US", isRemote: false });
  });
  it("detects US from an explicit marker", () => {
    expect(parseLocation("Austin, United States")).toEqual({ country: "US", isRemote: false });
  });
  it("flags remote and still resolves US", () => {
    expect(parseLocation("Remote (US)")).toEqual({ country: "US", isRemote: true });
  });
  it("flags remote with no resolvable country", () => {
    expect(parseLocation("Remote")).toEqual({ country: null, isRemote: true });
  });
  it("returns null country for a foreign location", () => {
    expect(parseLocation("London, UK")).toEqual({ country: null, isRemote: false });
  });
  it("returns null country for ambiguous text", () => {
    expect(parseLocation("Worldwide")).toEqual({ country: null, isRemote: false });
  });
  it("handles null input", () => {
    expect(parseLocation(null)).toEqual({ country: null, isRemote: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: FAIL — cannot find `./enrich`.

- [ ] **Step 3: Implement `parseLocation`**

```ts
// src/lib/jobs/enrich.ts
import {
  US_STATE_CODES,
  US_STATE_NAMES,
  US_CITIES,
  US_MARKERS,
} from "./enrich.data";

export interface LocationInfo {
  country: string | null;
  isRemote: boolean;
}

export function parseLocation(location: string | null | undefined): LocationInfo {
  if (!location) return { country: null, isRemote: false };
  const raw = location.toLowerCase();
  const isRemote = /\bremote\b/.test(raw);

  // Explicit US markers anywhere in the string.
  if (US_MARKERS.some((m) => raw.includes(m))) {
    return { country: "US", isRemote };
  }

  // Token-based checks: split on commas / parens / slashes.
  const tokens = raw.split(/[,/()]/).map((t) => t.trim()).filter(Boolean);
  for (const tok of tokens) {
    const upper = tok.toUpperCase();
    if (US_STATE_CODES.has(upper)) return { country: "US", isRemote };
    if (US_STATE_NAMES.has(tok)) return { country: "US", isRemote };
    if (US_CITIES.has(tok)) return { country: "US", isRemote };
  }

  return { country: null, isRemote };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/enrich.ts src/lib/jobs/enrich.test.ts
git commit -m "feat(jobs): add parseLocation classifier"
```

---

## Task 4: `classifyRole` classifier

**Files:**
- Modify: `src/lib/jobs/enrich.ts`
- Test: `src/lib/jobs/enrich.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/jobs/enrich.test.ts`:

```ts
import { classifyRole } from "./enrich";

describe("classifyRole", () => {
  it("classifies a specialized frontend title", () => {
    expect(classifyRole("Senior Frontend Engineer")).toEqual({
      roleCategory: "frontend",
      level: "senior",
    });
  });
  it("classifies ML over generic engineer", () => {
    expect(classifyRole("Machine Learning Engineer")).toEqual({
      roleCategory: "ml-ai",
      level: null,
    });
  });
  it("falls back to fullstack for a generic software title", () => {
    expect(classifyRole("Software Engineer")).toEqual({
      roleCategory: "fullstack",
      level: null,
    });
  });
  it("buckets a non-software title as other", () => {
    expect(classifyRole("Account Executive")).toEqual({
      roleCategory: "other",
      level: null,
    });
  });
  it("detects intern level", () => {
    expect(classifyRole("Backend Engineering Intern")).toEqual({
      roleCategory: "backend",
      level: "intern",
    });
  });
  it("detects staff before senior", () => {
    expect(classifyRole("Staff Software Engineer")).toEqual({
      roleCategory: "fullstack",
      level: "staff",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: FAIL — `classifyRole` not exported.

- [ ] **Step 3: Implement `classifyRole`**

Add to `src/lib/jobs/enrich.ts` (and add `ROLE_RULES`, `LEVEL_RULES` to the existing import from `./enrich.data`):

```ts
export interface RoleInfo {
  roleCategory: string;
  level: string | null;
}

export function classifyRole(title: string | null | undefined): RoleInfo {
  const t = (title ?? "").toLowerCase();

  let roleCategory = "other";
  for (const [category, keywords] of ROLE_RULES) {
    if (keywords.some((k) => t.includes(k))) {
      roleCategory = category;
      break;
    }
  }

  let level: string | null = null;
  for (const [lvl, keywords] of LEVEL_RULES) {
    if (keywords.some((k) => t.includes(k))) {
      level = lvl;
      break;
    }
  }

  return { roleCategory, level };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/enrich.ts src/lib/jobs/enrich.test.ts
git commit -m "feat(jobs): add classifyRole classifier"
```

---

## Task 5: `extractTechTags` classifier

**Files:**
- Modify: `src/lib/jobs/enrich.ts`
- Test: `src/lib/jobs/enrich.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/jobs/enrich.test.ts`:

```ts
import { extractTechTags } from "./enrich";

describe("extractTechTags", () => {
  it("extracts canonical tech names, deduped", () => {
    const tags = extractTechTags(
      "Senior React Engineer",
      "You will work with React, TypeScript and Node.js on AWS."
    );
    expect(tags).toEqual(expect.arrayContaining(["React", "TypeScript", "Node.js", "AWS"]));
    // Deduped: React appears in both title and body but only once.
    expect(tags.filter((t) => t === "React")).toHaveLength(1);
  });
  it("does not match 'go' inside another word", () => {
    expect(extractTechTags("Ongoing project work", "")).not.toContain("Go");
  });
  it("matches C++ and C# despite special chars", () => {
    const tags = extractTechTags("C++ / C# Developer", "");
    expect(tags).toEqual(expect.arrayContaining(["C++", "C#"]));
  });
  it("returns an empty array when nothing matches", () => {
    expect(extractTechTags("Account Manager", "Manage accounts.")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: FAIL — `extractTechTags` not exported.

- [ ] **Step 3: Implement `extractTechTags`**

Add `TECH_TERMS` to the `./enrich.data` import, then add to `src/lib/jobs/enrich.ts`:

```ts
// Precompile tech term regexes once at module load.
const TECH_REGEXES = TECH_TERMS.map(
  ([name, src]) => [name, new RegExp(src, "i")] as const
);

export function extractTechTags(title: string, description: string): string[] {
  const haystack = `${title} ${description}`;
  const found: string[] = [];
  for (const [name, re] of TECH_REGEXES) {
    if (re.test(haystack)) found.push(name);
  }
  return found;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/enrich.ts src/lib/jobs/enrich.test.ts
git commit -m "feat(jobs): add extractTechTags classifier"
```

---

## Task 6: Compose `enrichJob`

Combine the classifiers + numeric salary into one enrichment object keyed to a job's raw fields.

**Files:**
- Modify: `src/lib/jobs/enrich.ts`
- Test: `src/lib/jobs/enrich.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/jobs/enrich.test.ts`:

```ts
import { enrichJob } from "./enrich";

describe("enrichJob", () => {
  it("produces the full enrichment object", () => {
    const result = enrichJob({
      title: "Senior Frontend Engineer",
      location: "New York, NY",
      descriptionText: "Build with React and TypeScript. $150k – $190k.",
      salary: "$150K–$190K",
    });
    expect(result).toEqual({
      country: "US",
      isRemote: false,
      roleCategory: "frontend",
      level: "senior",
      techTags: expect.arrayContaining(["React", "TypeScript"]),
      salaryMin: 150000,
      salaryMax: 190000,
    });
  });

  it("derives salary from description when salary field is absent", () => {
    const result = enrichJob({
      title: "Backend Engineer",
      location: "Remote",
      descriptionText: "Compensation: $120,000 to $160,000.",
      salary: null,
    });
    expect(result.salaryMin).toBe(120000);
    expect(result.salaryMax).toBe(160000);
    expect(result.isRemote).toBe(true);
    expect(result.country).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: FAIL — `enrichJob` not exported.

- [ ] **Step 3: Implement `enrichJob`**

Add to `src/lib/jobs/enrich.ts` (add the salary import at top: `import { parseSalaryRange } from "./salary";`):

```ts
export interface EnrichInput {
  title: string;
  location: string | null;
  descriptionText: string;
  salary: string | null;
}

export interface JobEnrichment {
  country: string | null;
  isRemote: boolean;
  roleCategory: string;
  level: string | null;
  techTags: string[];
  salaryMin: number | null;
  salaryMax: number | null;
}

export function enrichJob(input: EnrichInput): JobEnrichment {
  const { country, isRemote } = parseLocation(input.location);
  const { roleCategory, level } = classifyRole(input.title);
  const techTags = extractTechTags(input.title, input.descriptionText);
  // Prefer the salary field; fall back to scanning the description.
  const { salaryMin, salaryMax } = parseSalaryRange(
    input.salary ?? input.descriptionText
  );
  return { country, isRemote, roleCategory, level, techTags, salaryMin, salaryMax };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/jobs/enrich.test.ts`
Expected: PASS (whole enrich suite green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/enrich.ts src/lib/jobs/enrich.test.ts
git commit -m "feat(jobs): compose enrichJob from classifiers"
```

---

## Task 7: Prisma schema — enrichment columns

**Files:**
- Modify: `prisma/schema.prisma` (the `Job` model, lines 114-133)

- [ ] **Step 1: Add columns + indexes**

Replace the `Job` model field list (keep existing relations/`@@unique`) so it reads:

```prisma
model Job {
  id              String        @id @default(cuid())
  userId          String?
  source          JobSource
  externalId      String?
  company         String
  title           String
  location        String?
  url             String?
  salary          String?
  descriptionText String
  postedAt        DateTime?
  createdAt       DateTime      @default(now())

  // Enrichment (heuristic, populated at ingest)
  country         String?
  isRemote        Boolean       @default(false)
  roleCategory    String?
  level           String?
  techTags        String[]
  salaryMin       Int?
  salaryMax       Int?

  user            User?         @relation(fields: [userId], references: [id], onDelete: Cascade)
  matches         Match[]
  applications    Application[]
  savedJobs       UserSavedJob[]

  @@unique([source, externalId])
  @@index([country])
  @@index([isRemote])
  @@index([roleCategory])
  @@index([level])
  @@index([salaryMin])
  @@index([techTags], type: Gin)
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name add_job_enrichment`
Expected: a new folder under `prisma/migrations/`, "Your database is now in sync", and the Prisma client regenerated.

- [ ] **Step 3: Verify the client typechecks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `Job` (new fields available on the generated type).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(jobs): add enrichment columns to Job"
```

---

## Task 8: Wire enrichment into ingest

**Files:**
- Modify: `src/trigger/poll-jobs.ts`

- [ ] **Step 1: Call `enrichJob` and persist columns**

Replace the file body with:

```ts
import { schedules } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { BOARDS } from "@/lib/jobs/boards.config";
import { fetchBoard } from "@/lib/jobs/fetchers";
import { enrichJob } from "@/lib/jobs/enrich";

export const pollJobs = schedules.task({
  id: "poll-jobs",
  cron: "0 * * * *", // hourly
  run: async () => {
    let upserts = 0;
    for (const cfg of BOARDS) {
      const jobs = await fetchBoard(cfg).catch(() => []);
      for (const j of jobs) {
        const e = enrichJob({
          title: j.title,
          location: j.location,
          descriptionText: j.descriptionText,
          salary: j.salary,
        });
        await prisma.job.upsert({
          where: { source_externalId: { source: "ats", externalId: j.externalId } },
          create: {
            source: "ats",
            externalId: j.externalId,
            company: j.company,
            title: j.title,
            location: j.location,
            url: j.url,
            descriptionText: j.descriptionText,
            postedAt: j.postedAt,
            salary: j.salary,
            country: e.country,
            isRemote: e.isRemote,
            roleCategory: e.roleCategory,
            level: e.level,
            techTags: e.techTags,
            salaryMin: e.salaryMin,
            salaryMax: e.salaryMax,
          },
          update: {
            title: j.title,
            location: j.location,
            url: j.url,
            descriptionText: j.descriptionText,
            postedAt: j.postedAt,
            salary: j.salary,
            country: e.country,
            isRemote: e.isRemote,
            roleCategory: e.roleCategory,
            level: e.level,
            techTags: e.techTags,
            salaryMin: e.salaryMin,
            salaryMax: e.salaryMax,
          },
        });
        upserts++;
      }
    }
    return { upserts };
  },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/trigger/poll-jobs.ts
git commit -m "feat(jobs): enrich jobs during poll-jobs ingest"
```

---

## Task 9: Backfill script for existing jobs

**Files:**
- Create: `scripts/backfill-enrichment.ts`

- [ ] **Step 1: Write the script**

```ts
// scripts/backfill-enrichment.ts
// One-off, idempotent: re-enrich every existing Job. Run with:
//   npx tsx scripts/backfill-enrichment.ts
import { prisma } from "@/lib/db";
import { enrichJob } from "@/lib/jobs/enrich";

async function main() {
  const batchSize = 200;
  let processed = 0;
  let cursor: string | undefined;

  for (;;) {
    const jobs = await prisma.job.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, title: true, location: true, descriptionText: true, salary: true },
    });
    if (jobs.length === 0) break;

    for (const j of jobs) {
      const e = enrichJob({
        title: j.title,
        location: j.location,
        descriptionText: j.descriptionText,
        salary: j.salary,
      });
      await prisma.job.update({
        where: { id: j.id },
        data: {
          country: e.country,
          isRemote: e.isRemote,
          roleCategory: e.roleCategory,
          level: e.level,
          techTags: e.techTags,
          salaryMin: e.salaryMin,
          salaryMax: e.salaryMax,
        },
      });
      processed++;
    }
    cursor = jobs[jobs.length - 1].id;
    console.log(`Backfilled ${processed} jobs…`);
  }

  console.log(`Done. ${processed} jobs enriched.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the backfill**

Run: `npx tsx scripts/backfill-enrichment.ts`
Expected: log lines ending with "Done. N jobs enriched." (N = current row count). Safe to re-run.

> Note: if `tsx` is not installed, run `npx -y tsx scripts/backfill-enrichment.ts`. The `@/` alias resolves via the project's `tsconfig.json` paths; if the script cannot resolve `@/lib/db`, run it with `npx tsx --tsconfig tsconfig.json scripts/backfill-enrichment.ts`.

- [ ] **Step 3: Spot-check the data**

Run: `npx prisma studio` (or a quick query) and confirm `roleCategory`, `country`, `techTags` are populated on existing rows.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-enrichment.ts
git commit -m "chore(jobs): add enrichment backfill script"
```

---

## Task 10: Query layer — filters + US base

Rewrite `buildJobWhere` for the new params and the US-or-remote base filter. Paste is gone, so the base is `source: "ats"` only.

**Files:**
- Modify: `src/lib/jobs/filters.ts`
- Test: `src/lib/jobs/filters.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `src/lib/jobs/filters.test.ts` contents (keep any existing imports/describe wrapper style) with cases covering the new behavior:

```ts
import { describe, it, expect } from "vitest";
import { buildJobWhere } from "./filters";

const USER = "user_1";

describe("buildJobWhere", () => {
  it("always restricts to ATS + (US or remote)", () => {
    const where = buildJobWhere({}, USER);
    expect(where).toMatchObject({
      source: "ats",
      OR: [{ country: "US" }, { isRemote: true }],
    });
  });

  it("adds a keyword OR across title and company", () => {
    const where = buildJobWhere({ q: "react" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { title: { contains: "react", mode: "insensitive" } },
        { company: { contains: "react", mode: "insensitive" } },
      ],
    });
  });

  it("filters by roleCategory and level", () => {
    const where = buildJobWhere({ roleCategory: "frontend", level: "senior" }, USER);
    expect(where.AND).toContainEqual({ roleCategory: "frontend" });
    expect(where.AND).toContainEqual({ level: "senior" });
  });

  it("filters by any of the requested tech tags", () => {
    const where = buildJobWhere({ techTags: "React,Go" }, USER);
    expect(where.AND).toContainEqual({ techTags: { hasSome: ["React", "Go"] } });
  });

  it("filters by minimum salary, excluding undisclosed", () => {
    const where = buildJobWhere({ salaryMin: "150000" }, USER);
    expect(where.AND).toContainEqual({
      OR: [
        { salaryMax: { gte: 150000 } },
        { AND: [{ salaryMax: null }, { salaryMin: { gte: 150000 } }] },
      ],
    });
  });

  it("ignores an unparseable salaryMin", () => {
    const where = buildJobWhere({ salaryMin: "abc" }, USER);
    expect(where).not.toHaveProperty("AND");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/jobs/filters.test.ts`
Expected: FAIL — current `buildJobWhere` doesn't handle the new params or base shape.

- [ ] **Step 3: Rewrite `buildJobWhere`**

Replace `src/lib/jobs/filters.ts` with:

```ts
import type { Prisma } from "@prisma/client";
import { z } from "zod";

const postedWithinPattern = /^[1-9]\d*d$/;

const FilterParams = z.object({
  q: z.string().optional(),
  location: z.string().optional(),
  company: z.string().optional(),
  roleCategory: z.string().optional(),
  level: z.string().optional(),
  techTags: z.string().optional(),
  remote: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  salaryMin: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return undefined;
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }),
  postedWithin: z
    .string()
    .optional()
    .transform((v) => (!v || !postedWithinPattern.test(v) ? undefined : v)),
});

export function buildJobWhere(
  rawParams: Record<string, string | string[] | undefined>,
  _userId: string
): Prisma.JobWhereInput {
  const flat: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(rawParams)) {
    flat[k] = Array.isArray(v) ? v[0] : v;
  }

  const parsed = FilterParams.safeParse(flat);
  const params = parsed.success ? parsed.data : ({} as z.infer<typeof FilterParams>);

  // Base: ATS-sourced, US or remote only.
  const base: Prisma.JobWhereInput = {
    source: "ats",
    OR: [{ country: "US" }, { isRemote: true }],
  };

  const conditions: Prisma.JobWhereInput[] = [];

  const q = params.q?.trim();
  if (q) {
    conditions.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const location = params.location?.trim();
  if (location) {
    conditions.push({ location: { contains: location, mode: "insensitive" } });
  }

  const company = params.company?.trim();
  if (company) {
    conditions.push({ company: { contains: company, mode: "insensitive" } });
  }

  if (params.roleCategory) {
    conditions.push({ roleCategory: params.roleCategory });
  }

  if (params.level) {
    conditions.push({ level: params.level });
  }

  const techTags = params.techTags
    ?.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (techTags && techTags.length > 0) {
    conditions.push({ techTags: { hasSome: techTags } });
  }

  if (params.remote === true) {
    conditions.push({ isRemote: true });
  }

  if (params.salaryMin !== undefined) {
    conditions.push({
      OR: [
        { salaryMax: { gte: params.salaryMin } },
        { AND: [{ salaryMax: null }, { salaryMin: { gte: params.salaryMin } }] },
      ],
    });
  }

  if (params.postedWithin) {
    const days = parseInt(params.postedWithin, 10);
    const gte = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    conditions.push({ postedAt: { gte } });
  }

  if (conditions.length === 0) return base;
  return { ...base, AND: conditions };
}
```

> Note: `_userId` is retained in the signature for call-site compatibility but is no longer used (pasted/user jobs are removed from the feed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/jobs/filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/filters.ts src/lib/jobs/filters.test.ts
git commit -m "feat(jobs): US base filter + keyword/facet/salary filtering"
```

---

## Task 11: Cursor pagination server action

**Files:**
- Create: `src/lib/jobs/actions.ts`

- [ ] **Step 1: Write the server action**

```ts
// src/lib/jobs/actions.ts
"use server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";

export const JOBS_PAGE_SIZE = 25;

export interface JobListRow {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string | null;
  salary: string | null;
  postedAt: Date | null;
  roleCategory: string | null;
  level: string | null;
  techTags: string[];
  descriptionText: string;
}

export async function loadMoreJobs(
  params: Record<string, string | undefined>,
  cursorId: string
): Promise<{ jobs: JobListRow[]; nextCursor: string | null }> {
  const user = await requireUser();
  const where = buildJobWhere(params, user.id);
  const jobs = await prisma.job.findMany({
    where,
    orderBy: [{ postedAt: "desc" }, { id: "desc" }],
    cursor: { id: cursorId },
    skip: 1,
    take: JOBS_PAGE_SIZE,
    select: {
      id: true, title: true, company: true, location: true, url: true,
      salary: true, postedAt: true, roleCategory: true, level: true,
      techTags: true, descriptionText: true,
    },
  });
  const nextCursor = jobs.length === JOBS_PAGE_SIZE ? jobs[jobs.length - 1].id : null;
  return { jobs, nextCursor };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/jobs/actions.ts
git commit -m "feat(jobs): add cursor pagination server action"
```

---

## Task 12: Company logo helpers

**Files:**
- Create: `src/lib/companies/logo.ts`
- Test: `src/lib/companies/logo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/companies/logo.test.ts
import { describe, it, expect } from "vitest";
import { companyDomain, monogram } from "./logo";

describe("companyDomain", () => {
  it("lowercases and appends .com", () => {
    expect(companyDomain("Stripe")).toBe("stripe.com");
  });
  it("strips spaces and punctuation", () => {
    expect(companyDomain("Acme, Co.")).toBe("acmeco.com");
  });
  it("strips common corporate suffixes", () => {
    expect(companyDomain("Globex Inc")).toBe("globex.com");
    expect(companyDomain("Initech LLC")).toBe("initech.com");
  });
  it("returns null for empty input", () => {
    expect(companyDomain("")).toBeNull();
  });
});

describe("monogram", () => {
  it("returns the first alphanumeric char uppercased", () => {
    expect(monogram("stripe")).toBe("S");
    expect(monogram("  9to5")).toBe("9");
  });
  it("falls back to ? for empty", () => {
    expect(monogram("")).toBe("?");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/companies/logo.test.ts`
Expected: FAIL — cannot find `./logo`.

- [ ] **Step 3: Implement the helpers**

```ts
// src/lib/companies/logo.ts

const SUFFIXES = /\b(inc|llc|ltd|corp|co|gmbh|plc)\b/gi;

/** Best-effort domain guess for a company name; null when not derivable. */
export function companyDomain(company: string): string | null {
  const cleaned = company
    .replace(SUFFIXES, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  return cleaned ? `${cleaned}.com` : null;
}

/** Logo service URL for a domain (Google's favicon service — no key required). */
export function logoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
}

/** Single-character monogram fallback. */
export function monogram(company: string): string {
  const ch = company.trim().match(/[a-z0-9]/i);
  return ch ? ch[0].toUpperCase() : "?";
}

/** Deterministic background color for a monogram, from the company name. */
export function monogramColor(company: string): string {
  let hash = 0;
  for (let i = 0; i < company.length; i++) {
    hash = (hash * 31 + company.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 55% 45%)`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/companies/logo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/companies/logo.ts src/lib/companies/logo.test.ts
git commit -m "feat(jobs): add company logo domain + monogram helpers"
```

---

## Task 13: `CompanyLogo` component

A client component that renders the logo `<img>` and swaps to a colored monogram on error. Uses a native `<img>` (not `next/image`) so no per-domain `remotePatterns` config is needed and the `onError` fallback is straightforward.

**Files:**
- Create: `src/components/company-logo.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/company-logo.tsx
"use client";

import { useState } from "react";
import { companyDomain, logoUrl, monogram, monogramColor } from "@/lib/companies/logo";

export function CompanyLogo({
  company,
  size = 40,
}: {
  company: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const domain = companyDomain(company);
  const showImg = domain && !failed;

  if (showImg) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl(domain)}
        alt={`${company} logo`}
        width={size}
        height={size}
        className="rounded-md object-contain bg-white border border-border"
        style={{ width: size, height: size }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="rounded-md flex items-center justify-center font-semibold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: monogramColor(company) }}
    >
      {monogram(company)}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/company-logo.tsx
git commit -m "feat(jobs): add CompanyLogo component with monogram fallback"
```

---

## Task 14: `JobSearchBar` component

**Files:**
- Create: `src/components/job-search-bar.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/job-search-bar.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function JobSearchBar() {
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [location, setLocation] = useState(sp.get("location") ?? "");

  useEffect(() => {
    setQ(sp.get("q") ?? "");
    setLocation(sp.get("location") ?? "");
  }, [sp]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    q.trim() ? params.set("q", q.trim()) : params.delete("q");
    location.trim() ? params.set("location", location.trim()) : params.delete("location");
    params.delete("selected"); // reset selection on a new search
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <Input
        type="text"
        placeholder="Search title or company"
        aria-label="Search title or company"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="flex-1"
      />
      <Input
        type="text"
        placeholder="Location (US)"
        aria-label="Location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="flex-1"
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/job-search-bar.tsx
git commit -m "feat(jobs): add JobSearchBar"
```

---

## Task 15: `JobFilterChips` component

Live dropdown chips that write to the URL. Built as native `<select>` chips (matches the existing `JobFilterBar` styling idiom) to keep it dependency-free.

**Files:**
- Create: `src/components/job-filter-chips.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/job-filter-chips.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";

const SELECT_CLASS =
  "h-8 rounded-full border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 transition-colors dark:bg-input/30";

const ROLE_OPTIONS = [
  ["", "Role: Any"], ["frontend", "Frontend"], ["backend", "Backend"],
  ["fullstack", "Full-stack"], ["mobile", "Mobile"], ["ml-ai", "ML / AI"],
  ["data", "Data"], ["devops", "DevOps"], ["security", "Security"], ["qa", "QA"],
] as const;

const LEVEL_OPTIONS = [
  ["", "Level: Any"], ["intern", "Intern"], ["junior", "Junior"], ["mid", "Mid"],
  ["senior", "Senior"], ["staff", "Staff"], ["lead", "Lead"], ["manager", "Manager"],
] as const;

const DATE_OPTIONS = [
  ["", "Date: Any"], ["1d", "Past day"], ["7d", "Past week"], ["30d", "Past month"],
] as const;

const SALARY_OPTIONS = [
  ["", "Salary: Any"], ["100000", "$100k+"], ["150000", "$150k+"], ["200000", "$200k+"],
] as const;

const TECH_OPTIONS = [
  ["", "Tech: Any"], ["React", "React"], ["TypeScript", "TypeScript"],
  ["Python", "Python"], ["Go", "Go"], ["Java", "Java"], ["AWS", "AWS"],
] as const;

export function JobFilterChips() {
  const sp = useSearchParams();
  const router = useRouter();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    value ? params.set(key, value) : params.delete(key);
    params.delete("selected");
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  function Chip({
    name, options, current,
  }: {
    name: string;
    options: ReadonlyArray<readonly [string, string]>;
    current: string;
  }) {
    return (
      <select
        aria-label={name}
        className={SELECT_CLASS}
        value={current}
        onChange={(e) => setParam(name, e.target.value)}
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    );
  }

  const remote = sp.get("remote") === "true";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip name="postedWithin" options={DATE_OPTIONS} current={sp.get("postedWithin") ?? ""} />
      <Chip name="roleCategory" options={ROLE_OPTIONS} current={sp.get("roleCategory") ?? ""} />
      <Chip name="level" options={LEVEL_OPTIONS} current={sp.get("level") ?? ""} />
      <Chip name="techTags" options={TECH_OPTIONS} current={sp.get("techTags") ?? ""} />
      <Chip name="salaryMin" options={SALARY_OPTIONS} current={sp.get("salaryMin") ?? ""} />
      <label className="flex h-8 items-center gap-2 cursor-pointer text-sm rounded-full border border-input px-3">
        <input
          type="checkbox"
          checked={remote}
          onChange={(e) => setParam("remote", e.target.checked ? "true" : "")}
          className="h-4 w-4 rounded border border-input accent-primary"
        />
        Remote
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/job-filter-chips.tsx
git commit -m "feat(jobs): add JobFilterChips"
```

---

## Task 16: `JobListItem` component

**Files:**
- Create: `src/components/job-list-item.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/job-list-item.tsx
"use client";

import { useOptimistic, useTransition } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { toggleSavedJob } from "@/lib/jobs/saved";

export interface JobListItemData {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  postedAt: string | null; // ISO string (serialized for the client)
  techTags: string[];
}

function postedAgo(iso: string | null): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function JobListItem({
  job,
  selected,
  saved,
  onSelect,
}: {
  job: JobListItemData;
  selected: boolean;
  saved: boolean;
  onSelect: () => void;
}) {
  const [isSaved, setOptimisticSaved] = useOptimistic(saved);
  const [, startTransition] = useTransition();

  function bookmark(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      setOptimisticSaved(!isSaved);
      await toggleSavedJob(job.id);
    });
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left flex gap-3 p-3 border-b border-border transition-colors ${
        selected ? "bg-accent border-l-2 border-l-primary" : "hover:bg-muted/50"
      }`}
    >
      <CompanyLogo company={job.company} size={36} />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{job.title}</div>
        <div className="text-sm text-muted-foreground truncate">
          {job.company}
          {job.location ? ` · ${job.location}` : ""}
        </div>
        <div className="text-sm">
          {job.salary && <span className="text-green-600">{job.salary}</span>}
          {job.salary && job.postedAt ? " · " : ""}
          <span className="text-muted-foreground">{postedAgo(job.postedAt)}</span>
        </div>
        {job.techTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {job.techTags.slice(0, 4).map((t) => (
              <span key={t} className="text-[0.65rem] bg-muted rounded px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        )}
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={bookmark}
        onKeyDown={(e) => { if (e.key === "Enter") bookmark(e as unknown as React.MouseEvent); }}
        aria-label={isSaved ? "Remove bookmark" : "Bookmark job"}
        aria-pressed={isSaved}
        className="text-lg leading-none text-amber-500 shrink-0"
      >
        {isSaved ? "★" : "☆"}
      </span>
    </button>
  );
}
```

> Note: `toggleSavedJob` is the existing server action in `src/lib/jobs/saved.ts` used by the current `JobCard`.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/job-list-item.tsx
git commit -m "feat(jobs): add JobListItem"
```

---

## Task 17: `JobDetailPane` component

Reuses the existing `MatchButton` and `SaveJobButton`.

**Files:**
- Create: `src/components/job-detail-pane.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/job-detail-pane.tsx
"use client";

import { CompanyLogo } from "@/components/company-logo";
import { MatchButton } from "@/components/match-button";
import { SaveJobButton } from "@/components/save-job-button";

export interface JobDetailData {
  id: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  url: string | null;
  descriptionText: string;
}

export function JobDetailPane({ job }: { job: JobDetailData | null }) {
  if (!job) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground p-8">
        Select a job to see the details.
      </div>
    );
  }

  return (
    <div className="p-5 overflow-y-auto h-full">
      <div className="flex items-center gap-3">
        <CompanyLogo company={job.company} size={48} />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold truncate">{job.title}</h2>
          <p className="text-muted-foreground truncate">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
            {job.salary ? ` · ${job.salary}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <SaveJobButton jobId={job.id} />
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            View original ↗
          </a>
        )}
      </div>
      <MatchButton jobId={job.id} />

      <hr className="my-4 border-border" />

      <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
        {job.descriptionText}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/job-detail-pane.tsx
git commit -m "feat(jobs): add JobDetailPane"
```

---

## Task 18: `JobsBrowser` two-pane container

Owns the list/detail layout, selection via `?selected=`, and "Load more".

**Files:**
- Create: `src/components/jobs-browser.tsx`

- [ ] **Step 1: Implement the component**

```tsx
// src/components/jobs-browser.tsx
"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { JobListItem, type JobListItemData } from "@/components/job-list-item";
import { JobDetailPane, type JobDetailData } from "@/components/job-detail-pane";
import { loadMoreJobs, type JobListRow } from "@/lib/jobs/actions";

export interface BrowserJob extends JobListItemData {
  url: string | null;
  descriptionText: string;
}

function toBrowserJob(row: JobListRow): BrowserJob {
  return {
    id: row.id, title: row.title, company: row.company, location: row.location,
    salary: row.salary, url: row.url,
    postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : null,
    techTags: row.techTags, descriptionText: row.descriptionText,
  };
}

export function JobsBrowser({
  initialJobs,
  initialCursor,
  savedIds,
  hasFilters,
}: {
  initialJobs: BrowserJob[];
  initialCursor: string | null;
  savedIds: string[];
  hasFilters: boolean;
}) {
  const sp = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState(initialJobs);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const saved = useMemo(() => new Set(savedIds), [savedIds]);

  const selectedId = sp.get("selected") ?? jobs[0]?.id ?? null;
  const selected = jobs.find((j) => j.id === selectedId) ?? null;

  function select(id: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("selected", id);
    router.replace(`/jobs?${params.toString()}`, { scroll: false });
  }

  async function more() {
    if (!cursor) return;
    setLoading(true);
    const flat: Record<string, string | undefined> = {};
    sp.forEach((v, k) => { if (k !== "selected") flat[k] = v; });
    const res = await loadMoreJobs(flat, cursor);
    setJobs((prev) => [...prev, ...res.jobs.map(toBrowserJob)]);
    setCursor(res.nextCursor);
    setLoading(false);
  }

  if (jobs.length === 0) {
    return hasFilters ? (
      <EmptyState title="No jobs match your filters" message="Try widening or clearing your filters." />
    ) : (
      <EmptyState title="No jobs yet" message="Check back after the next ATS sync." />
    );
  }

  const detail: JobDetailData | null = selected
    ? {
        id: selected.id, title: selected.title, company: selected.company,
        location: selected.location, salary: selected.salary, url: selected.url,
        descriptionText: selected.descriptionText,
      }
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] border border-border rounded-lg overflow-hidden h-[calc(100vh-220px)]">
      <div className="overflow-y-auto border-r border-border">
        {jobs.map((job) => (
          <JobListItem
            key={job.id}
            job={job}
            selected={job.id === selectedId}
            saved={saved.has(job.id)}
            onSelect={() => select(job.id)}
          />
        ))}
        {cursor && (
          <div className="p-3">
            <Button variant="outline" size="sm" onClick={more} disabled={loading} className="w-full">
              {loading ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>
      <div className="hidden md:block">
        <JobDetailPane job={detail} />
      </div>
    </div>
  );
}
```

> Note: on mobile (`< md`) the detail pane is hidden; tapping a job still updates `?selected=`. A full mobile detail route is out of scope for this plan (see spec "mobile collapses to the list"); the detail pane shows on `md+`. If a mobile detail view is desired later, render `<JobDetailPane>` in a Drawer when `selected` is set on small screens.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/jobs-browser.tsx
git commit -m "feat(jobs): add two-pane JobsBrowser"
```

---

## Task 19: Rewrite the Jobs page

Wire the page to the new components, fetch page 1, and remove the paste card + old filter bar.

**Files:**
- Modify: `src/app/(app)/jobs/page.tsx`

- [ ] **Step 1: Replace the page**

```tsx
// src/app/(app)/jobs/page.tsx
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildJobWhere } from "@/lib/jobs/filters";
import { listSavedJobIds } from "@/lib/jobs/saved-queries";
import { JOBS_PAGE_SIZE } from "@/lib/jobs/actions";
import { JobSearchBar } from "@/components/job-search-bar";
import { JobFilterChips } from "@/components/job-filter-chips";
import { JobsBrowser, type BrowserJob } from "@/components/jobs-browser";

export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const where = buildJobWhere(params, user.id);

  const [rows, savedSet] = await Promise.all([
    prisma.job.findMany({
      where,
      orderBy: [{ postedAt: "desc" }, { id: "desc" }],
      take: JOBS_PAGE_SIZE,
      select: {
        id: true, title: true, company: true, location: true, url: true,
        salary: true, postedAt: true, techTags: true, descriptionText: true,
      },
    }),
    listSavedJobIds(user.id),
  ]);

  const initialJobs: BrowserJob[] = rows.map((r) => ({
    id: r.id, title: r.title, company: r.company, location: r.location,
    salary: r.salary, url: r.url,
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    techTags: r.techTags, descriptionText: r.descriptionText,
  }));

  const initialCursor =
    rows.length === JOBS_PAGE_SIZE ? rows[rows.length - 1].id : null;

  // Selection-only params don't count as "filters" for the empty state.
  const filterKeys = Object.keys(params).filter((k) => k !== "selected");

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-semibold mb-1">Jobs</h1>
      <p className="text-muted-foreground mb-4">
        Browse US software roles synced from company job boards.
      </p>

      <div className="flex flex-col gap-3 mb-4">
        <JobSearchBar />
        <JobFilterChips />
      </div>

      <JobsBrowser
        initialJobs={initialJobs}
        initialCursor={initialCursor}
        savedIds={[...savedSet]}
        hasFilters={filterKeys.length > 0}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck + lint**

Run: `npx tsc --noEmit && npx next lint --file src/app/\(app\)/jobs/page.tsx`
Expected: no type errors. (Lint may warn on the `<img>` in `company-logo.tsx`; it's suppressed inline.)

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev` and open `http://localhost:3050/jobs`.
Expected: search bar + filter chips on top; two-pane list/detail; clicking a job updates the right pane and the `?selected=` URL; a role chip filters the list; "Load more" appends rows; no "Paste a Job" card.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/jobs/page.tsx"
git commit -m "feat(jobs): two-pane jobs page with search + facets"
```

---

## Task 20: Remove the paste feature

**Files:**
- Delete: `src/components/paste-job-form.tsx`, `src/app/api/jobs/paste/route.ts`, `src/app/api/jobs/paste/route.test.ts`, `src/components/job-filter-bar.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run: `grep -rn "PasteJobForm\|jobs/paste\|JobFilterBar" src --include=*.ts --include=*.tsx`
Expected: no matches (all usages were removed in Task 19). If any appear, fix them before deleting.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/paste-job-form.tsx \
       src/app/api/jobs/paste/route.ts \
       src/app/api/jobs/paste/route.test.ts \
       src/components/job-filter-bar.tsx
```

> Note: the old `src/components/job-card.tsx` is now unused but is left in place (it is harmless and may be referenced by future work). The `JobSource.paste` enum value and `source` column are intentionally retained for existing rows.

- [ ] **Step 3: Verify the build**

Run: `npx tsc --noEmit && npm run test`
Expected: typecheck clean; full Vitest suite passes (paste route test is gone).

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(jobs): remove manual paste-a-job feature"
```

---

## Task 21: End-to-end test

**Files:**
- Create: `e2e/jobs.spec.ts`

- [ ] **Step 1: Inspect an existing e2e spec for auth/setup conventions**

Run: `ls e2e && sed -n '1,40p' e2e/*.spec.ts | head -60`
Expected: shows how existing specs authenticate / set base URL. **Mirror that setup** (storage state, `test.use`, helpers) in the new spec — do not invent a new login flow.

- [ ] **Step 2: Write the spec (adapt auth to match Step 1)**

```ts
// e2e/jobs.spec.ts
import { test, expect } from "@playwright/test";

// NOTE: prepend whatever auth setup the other specs use (e.g. test.use({ storageState }))

test.describe("Jobs page", () => {
  test("search, filter, select, bookmark", async ({ page }) => {
    await page.goto("/jobs");

    // Two-pane present
    await expect(page.getByRole("heading", { name: "Jobs" })).toBeVisible();

    // Keyword search
    await page.getByLabel("Search title or company").fill("engineer");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page).toHaveURL(/q=engineer/);

    // Apply a role facet
    await page.getByLabel("roleCategory").selectOption("frontend");
    await expect(page).toHaveURL(/roleCategory=frontend/);

    // Select first job -> detail pane updates URL
    const firstJob = page.locator("button", { hasText: "·" }).first();
    await firstJob.click();
    await expect(page).toHaveURL(/selected=/);
  });
});
```

- [ ] **Step 3: Run the e2e test**

Run: `npm run e2e -- jobs.spec.ts`
Expected: PASS. (Requires the dev server / Playwright webServer config the other specs rely on, and at least one US/remote job in the test DB.)

- [ ] **Step 4: Commit**

```bash
git add e2e/jobs.spec.ts
git commit -m "test(jobs): e2e for search, facets, selection"
```

---

## Final verification

- [ ] Run full unit suite: `npm run test` → all green.
- [ ] Run typecheck: `npx tsc --noEmit` → clean.
- [ ] Run build: `npm run build` → succeeds.
- [ ] Manual: `/jobs` shows logos, US/remote-only listings, working facets, inline detail, load-more; no paste card.
- [ ] Confirm backfill ran (existing jobs have `roleCategory`/`country` populated).

---

## Notes / deviations from spec

- **Logos** use a native `<img>` against Google's favicon service with an `onError` monogram fallback, instead of `next/image` + `remotePatterns`. This avoids per-domain image config and keeps the fallback simple. (Spec mentioned `next.config` image host; this is the simpler equivalent.)
- **Tech facet** uses `hasSome` (match ANY selected tag) rather than `hasEvery`. The chip UI currently selects a single tech at a time, so the distinction is moot for v1; `hasSome` keeps multi-tag URLs permissive.
- **Mobile** shows the list and updates `?selected=` but hides the detail pane on `< md`. A mobile drawer detail view is noted as future work, consistent with the spec's "mobile collapses to the list."
