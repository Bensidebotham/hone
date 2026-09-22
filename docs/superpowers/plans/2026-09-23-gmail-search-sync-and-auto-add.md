# Gmail Search-First Sync + Auto-Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find job-application emails with targeted Gmail search queries (career-ops style) instead of a subject-keyword filter, and auto-add confidently detected new applications straight into the tracker with an Undo.

**Architecture:** A pure `queries.ts` builds the Gmail query set; a new `sync.ts` `syncConnection()` runs the queries, skips already-ledgered messages, classifies ≤150 per run oldest-first, and writes via `decide.ts` → `apply.ts`. `decide.ts` gains `create` (auto-add at ≥0.8) and `ignore` (ledger-only, incl. no-regression). The Trigger task shrinks to token handling + a loop over connections. The dashboard card shows auto-adds (with Undo) and pending suggestions.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 on Neon Postgres, Trigger.dev v4 scheduled task, Gemini 2.5 Flash via `analyze()`, Vitest + Testing Library, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-23-gmail-search-sync-and-auto-add-design.md`

## Global Constraints

- Auto-add / auto-apply threshold: `AUTO_APPLY_THRESHOLD = 0.8` (unchanged constant, reused for `create`).
- Missing title placeholder: exactly `"Role not specified"`.
- Auto-added application `source`: exactly `"Email"`; event summary exactly `"Added from email"`.
- Search window: `after = max(SYNC_FLOOR, (lastSyncedAt ?? now − 30 days) − 2 days)`, `SYNC_FLOOR = 2026-07-01T00:00:00Z`.
- Per run: `MAX_PER_RUN = 150` classified messages. `lastSyncedAt` advances to the run's `now` only if zero failures and not capped.
- Cron `0 * * * *`, task `maxDuration: 900`.
- Tracked-company sweep covers statuses `applied`, `interviewing`, `offer` only, chunked 10 per query.
- Status automation: nothing auto-moves out of `rejected` or `offer`; anything else may move to `rejected`; otherwise only forward along `saved < applied < interviewing < offer`.
- New `EmailOutcome` value: `ignored`. `ignored` rows never appear in the UI.
- Email bodies are never persisted (existing invariant).
- Commit directly to `main` (repo convention). End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run tests with `pnpm test` (vitest). Next.js 16 has breaking changes — read `node_modules/next/dist/docs/` before touching Next-specific APIs.

## Review Focus

1. **Classifier returns `company: ""`** (empty string, not null) — must not auto-create an app named "". Test in Task 5.
2. **The same message returned by several queries** (an ATS rejection matches both the ATS-sender and rejection-phrase queries) — must be classified once. Test in Task 7.
3. **Gmail fetch fails mid-run** (e.g., access token expires during a long backfill run) — already-processed messages stay ledgered, `lastSyncedAt` does not advance. Test in Task 7.
4. **Tracked company names containing `"`** — must not break the Gmail query syntax. Test in Task 1.
5. **The three stale Roblox `new_application` suggestions** — confirming one after Roblox is already tracked must link to the existing app, not duplicate it. Test in Task 8.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/gmail/queries.ts` (new) | Job-mail vocabulary: sender domain lists, `isGenericSenderDomain`, `buildSearchQueries`, `syncWindowStart`, `SYNC_FLOOR` |
| `src/lib/gmail/client.ts` | Gmail REST: add `searchMessages`, `receivedAt` on `getMessage`; remove `listHistory`, `listRecentMessages` |
| `src/lib/gmail/classify.ts` | Prompt: sharper `none` rules, assessments → interviewing, title from subject, `Date:` line |
| `src/lib/gmail/match.ts` | Company/sender/title matching against tracked apps |
| `src/lib/gmail/decide.ts` | Pure decision: `create` / `ignore` / `auto_apply` / `suggest_*`, `canAutoMove`, `ROLE_PLACEHOLDER` |
| `src/lib/gmail/apply.ts` | DB writes for a decision; returns `ApplyResult` |
| `src/lib/gmail/sync.ts` (new) | `syncConnection()` — one user's run |
| `src/trigger/sync-gmail.ts` | Schedule, token handling, loop over connections |
| `src/lib/gmail/suggestions.ts` | Confirm fix, `undoAutoAdd`, `getRecentAutoAdds` |
| `src/lib/applications/actions.ts` | `createManualApplication` returns the new id |
| `src/lib/dashboard/summary.ts` | Also fetch recent auto-adds |
| `src/components/dashboard/suggested-updates.tsx` | "From your email" card: Added (Undo) + Needs review |
| `prisma/schema.prisma` + migration | `EmailOutcome.ignored` |
| `scripts/gmail-backfill.ts` (new) | One-off `lastSyncedAt` reset |
| Deleted: `src/lib/gmail/relevance.ts`, `relevance.test.ts` | Replaced by queries |

---

### Task 1: Query builder (`queries.ts`)

**Files:**
- Create: `src/lib/gmail/queries.ts`
- Test: `src/lib/gmail/queries.test.ts`

**Interfaces:**
- Produces:
  - `SYNC_FLOOR: Date`
  - `ATS_DOMAINS: readonly string[]`, `ASSESSMENT_DOMAINS: readonly string[]`, `WEBMAIL_DOMAINS: readonly string[]`
  - `isGenericSenderDomain(domain: string): boolean`
  - `buildSearchQueries(input: { after: Date; trackedCompanies: string[] }): string[]`
  - `syncWindowStart(lastSyncedAt: Date | null, now: Date): Date`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/gmail/queries.test.ts
import { describe, it, expect } from "vitest";
import {
  buildSearchQueries, isGenericSenderDomain, syncWindowStart, SYNC_FLOOR,
} from "@/lib/gmail/queries";

const after = new Date("2026-09-01T00:00:00Z");
const epoch = Math.floor(after.getTime() / 1000);

describe("buildSearchQueries", () => {
  it("scopes every query to the window with an epoch after:", () => {
    const qs = buildSearchQueries({ after, trackedCompanies: [] });
    expect(qs.length).toBeGreaterThanOrEqual(6);
    for (const q of qs) expect(q.endsWith(` after:${epoch}`)).toBe(true);
  });

  it("covers ATS senders, confirmations, rejections, interviews and assessments", () => {
    const all = buildSearchQueries({ after, trackedCompanies: [] }).join("\n");
    expect(all).toContain("from:(greenhouse.io OR");
    expect(all).toContain("cloud.oracle.com");
    expect(all).toContain('"thank you for applying"');
    expect(all).toContain('"not moving forward"');
    expect(all).toContain('"invite you to interview"');
    expect(all).toContain("codesignal.com");
    expect(all).toContain('"online assessment"');
  });

  it("sweeps tracked companies in chunks of 10 with a job-word clause", () => {
    const companies = Array.from({ length: 12 }, (_, i) => `Co${i}`);
    const sweeps = buildSearchQueries({ after, trackedCompanies: companies })
      .filter((q) => q.includes('"Co0"') || q.includes('"Co10"'));
    expect(sweeps).toHaveLength(2);
    expect(sweeps[0]).toContain("(application OR applied OR interview OR assessment OR candidate OR recruiter");
  });

  it("dedupes tracked companies case-insensitively and strips quotes", () => {
    const qs = buildSearchQueries({ after, trackedCompanies: ["Acme", "acme", 'The "Best" Co', "  "] });
    const sweep = qs.find((q) => q.includes('"Acme"'))!;
    expect(sweep.match(/"acme"/gi)).toHaveLength(1);
    expect(sweep).toContain('"The Best Co"');
    expect(sweep).not.toContain('""');
  });

  it("emits no sweep query when nothing is tracked", () => {
    const qs = buildSearchQueries({ after, trackedCompanies: [] });
    expect(qs.some((q) => q.includes("recruiter OR"))).toBe(false);
  });
});

describe("isGenericSenderDomain", () => {
  it("matches ATS, assessment and webmail domains including subdomains", () => {
    expect(isGenericSenderDomain("hire.lever.co")).toBe(true);
    expect(isGenericSenderDomain("us.greenhouse-mail.io")).toBe(true);
    expect(isGenericSenderDomain("workflow.mail.us2.cloud.oracle.com")).toBe(true);
    expect(isGenericSenderDomain("otp.workday.com")).toBe(true);
    expect(isGenericSenderDomain("codesignal.com")).toBe(true);
    expect(isGenericSenderDomain("gmail.com")).toBe(true);
  });
  it("does not match company domains or lookalikes", () => {
    expect(isGenericSenderDomain("roblox.com")).toBe(false);
    expect(isGenericSenderDomain("notlever.co")).toBe(false);
  });
});

describe("syncWindowStart", () => {
  const now = new Date("2026-09-23T12:00:00Z");
  it("overlaps the last sync by 2 days", () => {
    expect(syncWindowStart(new Date("2026-09-20T12:00:00Z"), now))
      .toEqual(new Date("2026-09-18T12:00:00Z"));
  });
  it("looks back 30 days (+2 overlap) with no prior sync", () => {
    expect(syncWindowStart(null, now)).toEqual(new Date("2026-08-22T12:00:00Z"));
  });
  it("never reaches before the floor", () => {
    expect(syncWindowStart(new Date("2026-06-01T00:00:00Z"), now)).toEqual(SYNC_FLOOR);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/gmail/queries.test.ts`
Expected: FAIL — cannot resolve `@/lib/gmail/queries`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/gmail/queries.ts
/**
 * The job-mail vocabulary: which Gmail searches find application email, and
 * which sender domains are shared platforms rather than employers.
 *
 * Gmail search reads bodies as well as headers, so these queries are both the
 * recall mechanism and the privacy gate — only what they return ever reaches
 * the model. Sourced from career-ops' gmail-sync procedure; when an
 * application slips through, add the missing sender or phrase here.
 */

/** Nothing before this is in scope for the tracker, even on a first sync. */
export const SYNC_FLOOR = new Date("2026-07-01T00:00:00Z");

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERLAP_DAYS = 2;
const FIRST_SYNC_DAYS = 30;
const SWEEP_CHUNK = 10;

/** Applicant-tracking systems that send on behalf of many employers. */
export const ATS_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com",
  // workday.com also covers {company}@otp.workday.com candidate-account mail.
  "myworkday.com", "workday.com", "icims.com", "smartrecruiters.com",
  "jobvite.com", "successfactors.com", "taleo.net",
  // JPMorgan's confirmation came from …mail.us2.cloud.oracle.com.
  "oraclecloud.com", "cloud.oracle.com", "eightfold.ai", "workable.com",
  "applytojob.com", "bamboohr.com", "teamtailor.com", "breezy.hr", "rippling.com",
] as const;

/** Online-assessment platforms: their mail names the employer, not the sender. */
export const ASSESSMENT_DOMAINS = [
  "codesignal.com", "hackerrank.com", "hackerrankforwork.com", "hirevue.com",
  "karat.com", "codility.com", "testgorilla.com", "coderpad.io", "byteboard.dev",
] as const;

export const WEBMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
] as const;

const GENERIC = [...ATS_DOMAINS, ...ASSESSMENT_DOMAINS, ...WEBMAIL_DOMAINS];

/** True when a sender domain is shared infrastructure, not an employer. */
export function isGenericSenderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return GENERIC.some((g) => d === g || d.endsWith(`.${g}`));
}

const CONFIRMATION_PHRASES = [
  "thank you for applying", "thanks for applying", "application received",
  "received your application", "we received your application", "your application to",
  "application confirmation", "thank you for your interest",
];

const REJECTION_PHRASES = [
  "not moving forward", "move forward with other candidates", "pursue other candidates",
  "decided not to proceed", "not been selected", "regret to inform", "unable to offer",
  "your candidacy", "update on your application",
];

const INTERVIEW_TERMS = [
  "subject:interview", '"schedule a call"', '"phone screen"', '"next steps"',
  '"invite you to interview"', '"schedule your interview"',
];

const SWEEP_JOB_WORDS =
  '(application OR applied OR interview OR assessment OR candidate OR recruiter OR "next steps")';

const quoted = (phrases: string[]) => phrases.map((p) => `"${p}"`).join(" OR ");

function trackedCompanyTerms(companies: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of companies) {
    const name = raw.replace(/"/g, "").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    terms.push(`"${name}"`);
  }
  return terms;
}

export function buildSearchQueries(input: { after: Date; trackedCompanies: string[] }): string[] {
  const queries = [
    `from:(${ATS_DOMAINS.join(" OR ")})`,
    `(${quoted(CONFIRMATION_PHRASES)})`,
    `(${quoted(REJECTION_PHRASES)})`,
    `(${INTERVIEW_TERMS.join(" OR ")})`,
    `from:(${ASSESSMENT_DOMAINS.join(" OR ")})`,
    `subject:(assessment OR "coding challenge" OR "online assessment")`,
  ];

  // The job-word clause keeps consumer mail from tracked brands (Visa, Amex,
  // Amazon) out while still catching mid-pipeline mail sent from the
  // company's own domain, which no sender or phrase list would.
  const terms = trackedCompanyTerms(input.trackedCompanies);
  for (let i = 0; i < terms.length; i += SWEEP_CHUNK) {
    queries.push(`(${terms.slice(i, i + SWEEP_CHUNK).join(" OR ")}) ${SWEEP_JOB_WORDS}`);
  }

  const after = Math.floor(input.after.getTime() / 1000);
  return queries.map((q) => `${q} after:${after}`);
}

/**
 * Where a run's search window starts. The overlap absorbs Gmail indexing lag;
 * the EmailInsight ledger makes re-seeing a message free.
 */
export function syncWindowStart(lastSyncedAt: Date | null, now: Date): Date {
  const base = lastSyncedAt ?? new Date(now.getTime() - FIRST_SYNC_DAYS * DAY_MS);
  const start = new Date(base.getTime() - OVERLAP_DAYS * DAY_MS);
  return start < SYNC_FLOOR ? SYNC_FLOOR : start;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/gmail/queries.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/queries.ts src/lib/gmail/queries.test.ts
git commit -m "feat(gmail): career-ops-style search query builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Gmail client — `searchMessages` + `receivedAt`

**Files:**
- Modify: `src/lib/gmail/client.ts` (add `searchMessages`; `FetchedMessage.receivedAt`; `getMessage`)
- Test: `src/lib/gmail/client.test.ts`

`listHistory` / `listRecentMessages` are removed in Task 7, once nothing calls them.

**Interfaces:**
- Produces:
  - `searchMessages(accessToken: string, q: string, opts: { max: number }): Promise<string[]>`
  - `FetchedMessage` gains `receivedAt: Date` (from `internalDate`, ms epoch string; falls back to `new Date(0)` if absent)

- [ ] **Step 1: Write the failing tests** — append to `src/lib/gmail/client.test.ts` and extend its import to `import { listRecentMessages, searchMessages, getMessage } from "@/lib/gmail/client";`

```ts
describe("searchMessages", () => {
  it("sends the query verbatim and returns ids", async () => {
    fetchMock.mockResolvedValue(jsonOnce({ messages: [{ id: "m1" }, { id: "m2" }] }));
    const ids = await searchMessages("tok", 'from:(lever.co) after:123', { max: 2000 });
    expect(ids).toEqual(["m1", "m2"]);
    const url = new URL(requestedUrl());
    expect(url.searchParams.get("q")).toBe("from:(lever.co) after:123");
    expect(url.searchParams.get("maxResults")).toBe("500");
  });

  it("follows pagination and stops at the cap", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "c" }, { id: "d" }], nextPageToken: "p3" }));
    expect(await searchMessages("tok", "q", { max: 3 })).toEqual(["a", "b", "c"]);
    expect(new URL(requestedUrl(1)).searchParams.get("pageToken")).toBe("p2");
  });

  it("returns [] when Gmail reports no messages", async () => {
    fetchMock.mockResolvedValue(jsonOnce({ resultSizeEstimate: 0 }));
    expect(await searchMessages("tok", "q", { max: 10 })).toEqual([]);
  });

  it("gives up when a page adds no new ids", async () => {
    fetchMock.mockResolvedValue(jsonOnce({ messages: [{ id: "same" }], nextPageToken: "more" }));
    expect(await searchMessages("tok", "q", { max: 10 })).toEqual(["same"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getMessage", () => {
  it("returns receivedAt from internalDate", async () => {
    fetchMock.mockResolvedValue(jsonOnce({
      id: "m1", threadId: "t1", internalDate: "1758585600000", snippet: "s",
      payload: { headers: [{ name: "From", value: "a@b.com" }, { name: "Subject", value: "Hi" }] },
    }));
    const msg = await getMessage("tok", "m1");
    expect(msg.receivedAt).toEqual(new Date(1758585600000));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/gmail/client.test.ts`
Expected: FAIL — `searchMessages` is not exported; `receivedAt` undefined.

- [ ] **Step 3: Implement** — in `src/lib/gmail/client.ts`:

Add `receivedAt: Date;` to `FetchedMessage`, and in `getMessage` add to the returned object:

```ts
    receivedAt: new Date(Number(json.internalDate ?? 0)),
```

Append:

```ts
/**
 * Message ids matching a Gmail search query, newest first, capped at `max`.
 * Gmail excludes spam and trash from search by default.
 */
export async function searchMessages(
  accessToken: string,
  q: string,
  { max }: { max: number }
): Promise<string[]> {
  const ids = new Set<string>();
  let pageToken: string | undefined;

  do {
    const qs = new URLSearchParams({ q, maxResults: String(Math.min(500, max)) });
    if (pageToken) qs.set("pageToken", pageToken);
    const json: any = await gget(accessToken, `/messages?${qs.toString()}`);

    const before = ids.size;
    for (const m of json.messages ?? []) {
      if (m.id) ids.add(m.id);
      if (ids.size >= max) return [...ids];
    }
    if (ids.size === before) break;
    pageToken = json.nextPageToken;
  } while (pageToken);

  return [...ids];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/gmail/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/client.ts src/lib/gmail/client.test.ts
git commit -m "feat(gmail): searchMessages + receivedAt on fetched messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sharper classifier prompt

**Files:**
- Modify: `src/lib/gmail/classify.ts` (`EmailForClassify`, `buildClassifyPrompt`)
- Test: `src/lib/gmail/classify.test.ts`

**Interfaces:**
- Produces: `EmailForClassify` gains optional `receivedAt?: Date`. Schema and `classifyEmail` signature unchanged.

- [ ] **Step 1: Write the failing tests** — add inside `describe("buildClassifyPrompt", …)`:

```ts
  it("tells the model what is NOT an application email", () => {
    const { system } = buildClassifyPrompt({ from: "a@b.com", subject: "s", body: "b" });
    expect(system).toMatch(/job ads/i);
    expect(system).toMatch(/job-alert/i);
    expect(system).toMatch(/LinkedIn/);
    expect(system).toMatch(/cold outreach/i);
  });

  it("routes online assessments to interviewing and titles from the subject", () => {
    const { system } = buildClassifyPrompt({ from: "a@b.com", subject: "s", body: "b" });
    expect(system).toMatch(/assessment[^\n]*interviewing/i);
    expect(system).toMatch(/title[^\n]*subject/i);
  });

  it("includes the received date when known", () => {
    const { prompt } = buildClassifyPrompt({
      from: "a@b.com", subject: "s", body: "b", receivedAt: new Date("2026-09-10T15:00:00Z"),
    });
    expect(prompt).toContain("Date: 2026-09-10");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/gmail/classify.test.ts`
Expected: FAIL on the three new tests.

- [ ] **Step 3: Implement** — replace `EmailForClassify` and `buildClassifyPrompt`:

```ts
export interface EmailForClassify {
  from: string;
  subject: string;
  body: string;
  receivedAt?: Date;
}

export function buildClassifyPrompt(email: EmailForClassify): { system: string; prompt: string } {
  const system = [
    "You classify a single email about the recipient's own job applications.",
    'Return ONLY JSON: {"status","confidence","company","title","reason"}.',
    `status is one of: ${EMAIL_STATUSES.join(", ")}.`,
    "- applied: confirmation that an application the recipient submitted was received.",
    "- interviewing: an interview invite or scheduling, a recruiter screen, or an online assessment / coding challenge invitation or reminder (CodeSignal, HackerRank, HireVue, etc.) — assessments count as interviewing.",
    "- offer: a job offer is extended.",
    "- rejected: the candidate is declined / not moving forward.",
    "- none: anything else. This includes job ads and \"position now available\" / \"we're hiring\" mail, job-alert digests and recommended-jobs mail, LinkedIn / Indeed / Handshake notifications, recruiter cold outreach about a role the recipient did not apply to, newsletters and marketing.",
    "confidence is 0..1: how sure you are that this concerns an application the recipient actually submitted AND of the status.",
    "company: the hiring company (not the ATS or assessment vendor), else null.",
    "title: the role; take it from the subject line if the body does not name it; null only if neither does.",
    "reason: one short sentence of justification.",
  ].join("\n");

  const prompt = [
    `From: ${email.from}`,
    ...(email.receivedAt ? [`Date: ${email.receivedAt.toISOString().slice(0, 10)}`] : []),
    `Subject: ${email.subject}`,
    "Body:",
    email.body.slice(0, 2000),
  ].join("\n");

  return { system, prompt };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/gmail/classify.test.ts`
Expected: PASS (old + new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/classify.ts src/lib/gmail/classify.test.ts
git commit -m "feat(gmail): tighten classifier — exclude ads/alerts, assessments are interviews

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Matching fixes

**Files:**
- Modify: `src/lib/gmail/match.ts` (whole file)
- Test: `src/lib/gmail/match.test.ts`

**Interfaces:**
- Consumes: `isGenericSenderDomain` (Task 1).
- Produces:
  - `AppCandidate = { applicationId: string; company: string; title: string; status: AppStatus }` (**`title` added**; callers pass candidates ordered newest-created first)
  - `matchApplication(input: { fromEmail: string; company: string | null; title?: string | null }, candidates: AppCandidate[]): MatchResult` (MatchResult unchanged)

- [ ] **Step 1: Update the existing test fixtures and add new tests** — in `src/lib/gmail/match.test.ts`, give every candidate a `title` (e.g. `title: "SWE"` for acme/globex, `title: "X"` for `app-co`), then append:

```ts
describe("matchApplication — sender domains", () => {
  const roblox: AppCandidate[] = [{ applicationId: "app-roblox", company: "Roblox", title: "SWE", status: "applied" }];

  it("uses the registrable domain, not the first label", () => {
    const m = matchApplication({ fromEmail: "Roblox Assessment <noreply@email.roblox.com>", company: null }, roblox);
    expect(m.applicationId).toBe("app-roblox");
  });

  it("treats ATS subdomains as generic", () => {
    const hire: AppCandidate[] = [{ applicationId: "app-hire", company: "Hire", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "no-reply@hire.lever.co", company: null }, hire).applicationId).toBeNull();
  });

  it("handles two-letter country SLDs", () => {
    const acme: AppCandidate[] = [{ applicationId: "app-acme-uk", company: "Acme", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "jobs@careers.acme.co.uk", company: null }, acme).applicationId).toBe("app-acme-uk");
  });
});

describe("matchApplication — company names", () => {
  it("does not let a short name contain-match a longer one", () => {
    const apps: AppCandidate[] = [{ applicationId: "app-mb", company: "Metabase", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "x@greenhouse.io", company: "Meta" }, apps).applicationId).toBeNull();
  });

  it("still contain-matches names of 5+ characters", () => {
    const apps: AppCandidate[] = [{ applicationId: "app-jpm", company: "JPMorgan Chase & Co.", title: "SWE", status: "applied" }];
    expect(matchApplication({ fromEmail: "x@oracle.com", company: "JPMorgan" }, apps).applicationId).toBe("app-jpm");
  });

  it("prefers the same-company app whose title overlaps the email's", () => {
    const apps: AppCandidate[] = [
      { applicationId: "newer", company: "Stripe", title: "Software Engineer, New Grad", status: "applied" },
      { applicationId: "older", company: "Stripe", title: "Data Scientist Intern", status: "applied" },
    ];
    expect(matchApplication({ fromEmail: "x@stripe.com", company: "Stripe", title: "Data Scientist" }, apps).applicationId).toBe("older");
  });

  it("falls back to the first (newest) same-company app without a title hint", () => {
    const apps: AppCandidate[] = [
      { applicationId: "newer", company: "Stripe", title: "A", status: "applied" },
      { applicationId: "older", company: "Stripe", title: "B", status: "applied" },
    ];
    expect(matchApplication({ fromEmail: "x@stripe.com", company: "Stripe" }, apps).applicationId).toBe("newer");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/gmail/match.test.ts`
Expected: FAIL on registrable-domain, subdomain, co.uk, Meta/Metabase, and title-preference tests.

- [ ] **Step 3: Implement** — replace `src/lib/gmail/match.ts`:

```ts
import type { AppStatus } from "@prisma/client";
import { isGenericSenderDomain } from "@/lib/gmail/queries";

/** A tracked application. Callers pass these newest-created first. */
export interface AppCandidate {
  applicationId: string;
  company: string;
  title: string;
  status: AppStatus;
}

export interface MatchResult {
  applicationId: string | null;
  currentStatus: AppStatus | null;
}

/** Below this length, containment is too loose ("meta" ⊂ "metabase"). */
const MIN_CONTAIN_LEN = 5;

function normalizeCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function sameCompany(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_CONTAIN_LEN && long.includes(short);
}

/** "email.roblox.com" → "roblox"; "careers.acme.co.uk" → "acme". */
function registrableLabel(domain: string): string | undefined {
  const parts = domain.split(".");
  const n = parts.length;
  const twoLevelTld = n >= 3 && parts[n - 1].length === 2 && parts[n - 2].length <= 3;
  return twoLevelTld ? parts[n - 3] : parts[n - 2];
}

function senderCompanyToken(fromEmail: string): string | null {
  const match = fromEmail.match(/<([^>]+)>/);
  const addr = (match ? match[1] : fromEmail).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  const domain = addr.slice(at + 1);
  // Shared senders (ATS, assessment vendors, webmail) say nothing about the employer.
  if (isGenericSenderDomain(domain)) return null;
  const label = registrableLabel(domain);
  return label ? normalizeCompany(label) : null;
}

function titleWords(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
}

/** Among same-company apps, the one sharing the most title words; ties keep list order. */
function pickByTitle(hits: AppCandidate[], title: string | null | undefined): AppCandidate {
  if (!title || hits.length === 1) return hits[0];
  const want = titleWords(title);
  let best = hits[0];
  let bestScore = -1;
  for (const h of hits) {
    const score = [...titleWords(h.title)].filter((w) => want.has(w)).length;
    if (score > bestScore) { best = h; bestScore = score; }
  }
  return best;
}

export function matchApplication(
  input: { fromEmail: string; company: string | null; title?: string | null },
  candidates: AppCandidate[]
): MatchResult {
  const keyed = candidates.map((c) => ({ c, key: normalizeCompany(c.company) }));

  const find = (target: string | null): AppCandidate[] =>
    target ? keyed.filter((k) => sameCompany(k.key, target)).map((k) => k.c) : [];

  // 1) The classified company name; 2) a direct-company sender domain.
  let hits = find(input.company ? normalizeCompany(input.company) : null);
  if (hits.length === 0) hits = find(senderCompanyToken(input.fromEmail));
  if (hits.length === 0) return { applicationId: null, currentStatus: null };

  const hit = pickByTitle(hits, input.title);
  return { applicationId: hit.applicationId, currentStatus: hit.status };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/gmail/match.test.ts`
Expected: PASS (old + new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/match.ts src/lib/gmail/match.test.ts
git commit -m "fix(gmail): match on registrable sender domain, stricter names, prefer title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`src/trigger/sync-gmail.ts` builds candidates without `title` — and after Tasks 5–6 also uses the old `skip`/boolean API — so it fails typecheck until Task 7 rewrites it. Vitest does not typecheck, so tests stay green meanwhile; the first `tsc` gate is Task 7 Step 7.)

---

### Task 5: Decisions — `create`, `ignore`, no regressions

**Files:**
- Modify: `src/lib/gmail/decide.ts` (whole file)
- Test: `src/lib/gmail/decide.test.ts` (whole file)

**Interfaces:**
- Consumes: `Classification`, `MatchResult`.
- Produces:
  - `ROLE_PLACEHOLDER = "Role not specified"`
  - `canAutoMove(from: AppStatus, to: AppStatus): boolean`
  - `Decision` =
    - `{ action: "auto_apply"; applicationId: string; fromStatus: AppStatus; toStatus: AppStatus }`
    - `{ action: "suggest_status"; applicationId: string; suggestedStatus: AppStatus }`
    - `{ action: "create"; status: AppStatus; company: string; title: string | null }`
    - `{ action: "suggest_new"; suggestedStatus: AppStatus; company: string | null; title: string | null }`
    - `{ action: "ignore"; reason: string; applicationId: string | null }`

- [ ] **Step 1: Replace the test file**

```ts
// src/lib/gmail/decide.test.ts
import { describe, it, expect } from "vitest";
import { decideEmailAction, canAutoMove, AUTO_APPLY_THRESHOLD, ROLE_PLACEHOLDER } from "@/lib/gmail/decide";
import type { Classification } from "@/lib/gmail/classify";

const base: Classification = { status: "rejected", confidence: 0.95, company: "Acme", title: "SWE", reason: "x" };
const unmatched = { applicationId: null, currentStatus: null };

describe("decideEmailAction — matched", () => {
  it("auto-applies a confident forward move", () => {
    expect(decideEmailAction(base, { applicationId: "a1", currentStatus: "applied" }))
      .toEqual({ action: "auto_apply", applicationId: "a1", fromStatus: "applied", toStatus: "rejected" });
  });

  it("suggests a low-confidence forward move", () => {
    expect(decideEmailAction({ ...base, confidence: 0.5 }, { applicationId: "a1", currentStatus: "applied" }))
      .toEqual({ action: "suggest_status", applicationId: "a1", suggestedStatus: "rejected" });
  });

  it("ignores when already in that status", () => {
    expect(decideEmailAction(base, { applicationId: "a1", currentStatus: "rejected" }))
      .toEqual({ action: "ignore", reason: "already in status", applicationId: "a1" });
  });

  it("ignores a backwards move (old confirmation after an interview)", () => {
    const d = decideEmailAction({ ...base, status: "applied" }, { applicationId: "a1", currentStatus: "interviewing" });
    expect(d).toEqual({ action: "ignore", reason: "would regress status", applicationId: "a1" });
  });
});

describe("decideEmailAction — unmatched", () => {
  it("creates a confident, named application", () => {
    expect(decideEmailAction({ ...base, status: "applied" }, unmatched))
      .toEqual({ action: "create", status: "applied", company: "Acme", title: "SWE" });
  });

  it("creates even without a title", () => {
    expect(decideEmailAction({ ...base, title: null }, unmatched))
      .toEqual({ action: "create", status: "rejected", company: "Acme", title: null });
  });

  it("suggests below the threshold", () => {
    expect(decideEmailAction({ ...base, confidence: 0.79 }, unmatched))
      .toEqual({ action: "suggest_new", suggestedStatus: "rejected", company: "Acme", title: "SWE" });
  });

  it("suggests instead of creating when the company is missing or blank", () => {
    expect(decideEmailAction({ ...base, company: null }, unmatched).action).toBe("suggest_new");
    expect(decideEmailAction({ ...base, company: "   " }, unmatched).action).toBe("suggest_new");
  });

  it("trims the company it creates", () => {
    const d = decideEmailAction({ ...base, company: "  Acme " }, unmatched);
    expect(d).toMatchObject({ action: "create", company: "Acme" });
  });
});

describe("decideEmailAction — none", () => {
  it("ignores status none, keeping any match for the ledger", () => {
    expect(decideEmailAction({ ...base, status: "none" }, unmatched))
      .toEqual({ action: "ignore", reason: "not an application email", applicationId: null });
  });
});

describe("canAutoMove", () => {
  it("moves forward only", () => {
    expect(canAutoMove("saved", "applied")).toBe(true);
    expect(canAutoMove("applied", "interviewing")).toBe(true);
    expect(canAutoMove("interviewing", "offer")).toBe(true);
    expect(canAutoMove("interviewing", "applied")).toBe(false);
  });
  it("allows rejection from any open status", () => {
    expect(canAutoMove("applied", "rejected")).toBe(true);
    expect(canAutoMove("interviewing", "rejected")).toBe(true);
  });
  it("never moves out of rejected or offer", () => {
    expect(canAutoMove("rejected", "interviewing")).toBe(false);
    expect(canAutoMove("offer", "rejected")).toBe(false);
  });
});

it("constants", () => {
  expect(AUTO_APPLY_THRESHOLD).toBe(0.8);
  expect(ROLE_PLACEHOLDER).toBe("Role not specified");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/gmail/decide.test.ts`
Expected: FAIL — `canAutoMove`, `ROLE_PLACEHOLDER` not exported; `create`/`ignore` actions missing.

- [ ] **Step 3: Implement** — replace `src/lib/gmail/decide.ts`:

```ts
import type { AppStatus } from "@prisma/client";
import type { Classification } from "@/lib/gmail/classify";
import type { MatchResult } from "@/lib/gmail/match";

export const AUTO_APPLY_THRESHOLD = 0.8;

/** Title for an application whose email never named the role. */
export const ROLE_PLACEHOLDER = "Role not specified";

export type Decision =
  | { action: "auto_apply"; applicationId: string; fromStatus: AppStatus; toStatus: AppStatus }
  | { action: "suggest_status"; applicationId: string; suggestedStatus: AppStatus }
  | { action: "create"; status: AppStatus; company: string; title: string | null }
  | { action: "suggest_new"; suggestedStatus: AppStatus; company: string | null; title: string | null }
  | { action: "ignore"; reason: string; applicationId: string | null };

const RANK: Record<Exclude<AppStatus, "rejected">, number> = {
  saved: 0, applied: 1, interviewing: 2, offer: 3,
};

/**
 * Whether email may move an application from one status to another. Mail is
 * processed out of order during a backfill, so an old "we received your
 * application" must never drag an interview back to applied.
 */
export function canAutoMove(from: AppStatus, to: AppStatus): boolean {
  if (from === "rejected" || from === "offer") return false;
  if (to === "rejected") return true;
  return RANK[to] > RANK[from];
}

export function decideEmailAction(c: Classification, m: MatchResult): Decision {
  if (c.status === "none") {
    return { action: "ignore", reason: "not an application email", applicationId: m.applicationId };
  }

  // status is now one of the AppStatus values (applied|interviewing|offer|rejected).
  const toStatus = c.status as AppStatus;

  if (m.applicationId) {
    const from = m.currentStatus!;
    if (from === toStatus) return { action: "ignore", reason: "already in status", applicationId: m.applicationId };
    if (!canAutoMove(from, toStatus)) {
      return { action: "ignore", reason: "would regress status", applicationId: m.applicationId };
    }
    if (c.confidence >= AUTO_APPLY_THRESHOLD) {
      return { action: "auto_apply", applicationId: m.applicationId, fromStatus: from, toStatus };
    }
    return { action: "suggest_status", applicationId: m.applicationId, suggestedStatus: toStatus };
  }

  const company = c.company?.trim() || null;
  if (company && c.confidence >= AUTO_APPLY_THRESHOLD) {
    return { action: "create", status: toStatus, company, title: c.title?.trim() || null };
  }
  return { action: "suggest_new", suggestedStatus: toStatus, company, title: c.title };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/gmail/decide.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/decide.ts src/lib/gmail/decide.test.ts
git commit -m "feat(gmail): decide create/ignore, block status regressions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `ignored` outcome + apply `create`/`ignore`

**Files:**
- Modify: `prisma/schema.prisma` (enum `EmailOutcome`)
- Create: `prisma/migrations/20260923120000_email_outcome_ignored/migration.sql`
- Modify: `src/lib/gmail/apply.ts` (whole file)
- Test: `src/lib/gmail/apply.test.ts` (new)

**Interfaces:**
- Consumes: `Decision`, `ROLE_PLACEHOLDER` (Task 5), `AppCandidate` (Task 4).
- Produces:
  - `IncomingEmail` gains `receivedAt: Date`
  - `applyDecision(userId, email, decision): Promise<ApplyResult>` where `ApplyResult = { wrote: boolean; created?: AppCandidate }`

- [ ] **Step 1: Schema + migration**

In `prisma/schema.prisma` change the enum to:

```prisma
enum EmailOutcome {
  auto_applied
  suggested
  accepted
  dismissed
  ignored
}
```

Create `prisma/migrations/20260923120000_email_outcome_ignored/migration.sql`:

```sql
-- AlterEnum
ALTER TYPE "EmailOutcome" ADD VALUE 'ignored';
```

Run: `pnpm prisma generate`
Expected: "Generated Prisma Client". (Do NOT run `migrate deploy` here — Task 10 applies it, with the user's go-ahead.)

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/gmail/apply.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const insightFind = vi.fn();
const insightCreate = vi.fn().mockResolvedValue({});
const appUpdate = vi.fn().mockResolvedValue({});
const txAppCreate = vi.fn();
const txEventCreate = vi.fn().mockResolvedValue({});
const txInsightCreate = vi.fn().mockResolvedValue({});
const recordEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  prisma: {
    emailInsight: { findUnique: (...a: any) => insightFind(...a), create: (...a: any) => insightCreate(...a) },
    application: { update: (...a: any) => appUpdate(...a) },
    $transaction: (fn: any) => fn({
      application: { create: (...a: any) => txAppCreate(...a) },
      applicationEvent: { create: (...a: any) => txEventCreate(...a) },
      emailInsight: { create: (...a: any) => txInsightCreate(...a) },
    }),
  },
}));
vi.mock("@/lib/applications/events", () => ({ recordApplicationEvent: (...a: any) => recordEvent(...a) }));

import { applyDecision, type IncomingEmail } from "@/lib/gmail/apply";

const email: IncomingEmail = {
  messageId: "m1", threadId: "t1", fromEmail: "no-reply@ashbyhq.com",
  subject: "Thanks for applying to Valon", snippet: "s", confidence: 0.9,
  receivedAt: new Date("2026-09-02T10:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  insightFind.mockResolvedValue(null);
  txAppCreate.mockResolvedValue({ id: "new-app", company: "Valon", title: "Role not specified", status: "applied" });
});

describe("applyDecision — create", () => {
  it("creates the application, a created event and a linked auto_applied insight", async () => {
    const res = await applyDecision("u1", email, { action: "create", status: "applied", company: "Valon", title: null });

    expect(txAppCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1", company: "Valon", title: "Role not specified", status: "applied",
        appliedAt: email.receivedAt, source: "Email",
      },
    });
    expect(txEventCreate).toHaveBeenCalledWith({
      data: { applicationId: "new-app", userId: "u1", type: "created", toStatus: "applied", summary: "Added from email" },
    });
    expect(txInsightCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: "m1", kind: "new_application", outcome: "auto_applied",
        applicationId: "new-app", company: "Valon", title: null, suggestedStatus: "applied",
      }),
    });
    expect(res).toEqual({
      wrote: true,
      created: { applicationId: "new-app", company: "Valon", title: "Role not specified", status: "applied" },
    });
  });

  it("does nothing for an already-ledgered message", async () => {
    insightFind.mockResolvedValue({ id: "x" });
    const res = await applyDecision("u1", email, { action: "create", status: "applied", company: "Valon", title: null });
    expect(res).toEqual({ wrote: false });
    expect(txAppCreate).not.toHaveBeenCalled();
  });
});

describe("applyDecision — ignore", () => {
  it("writes an ignored ledger row", async () => {
    const res = await applyDecision("u1", email, { action: "ignore", reason: "not an application email", applicationId: null });
    expect(insightCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ messageId: "m1", kind: "status_change", outcome: "ignored", applicationId: null }),
    });
    expect(res).toEqual({ wrote: true });
  });
});

describe("applyDecision — auto_apply", () => {
  it("dates an applied move from the email, not now", async () => {
    await applyDecision("u1", email, { action: "auto_apply", applicationId: "a1", fromStatus: "saved", toStatus: "applied" });
    expect(appUpdate).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "applied", appliedAt: email.receivedAt } });
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm test src/lib/gmail/apply.test.ts`
Expected: FAIL — `create`/`ignore` unhandled, return shape is boolean.

- [ ] **Step 4: Implement** — replace `src/lib/gmail/apply.ts`:

```ts
import { prisma } from "@/lib/db";
import { recordApplicationEvent } from "@/lib/applications/events";
import { ROLE_PLACEHOLDER, type Decision } from "@/lib/gmail/decide";
import type { AppCandidate } from "@/lib/gmail/match";

export interface IncomingEmail {
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  subject: string | null;
  snippet: string | null;
  confidence: number;
  receivedAt: Date;
}

export interface ApplyResult {
  wrote: boolean;
  /** Set when this email created an application, so later mail in the run can match it. */
  created?: AppCandidate;
}

/**
 * Persist the outcome of one classified email. Idempotent on messageId: every
 * outcome — including "ignored" — writes exactly one EmailInsight, and that
 * row is what stops a message being classified again.
 */
export async function applyDecision(
  userId: string,
  email: IncomingEmail,
  decision: Decision
): Promise<ApplyResult> {
  const existing = await prisma.emailInsight.findUnique({
    where: { messageId: email.messageId },
    select: { id: true },
  });
  if (existing) return { wrote: false };

  const source = {
    userId, messageId: email.messageId, threadId: email.threadId,
    fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
    confidence: email.confidence,
  };

  if (decision.action === "ignore") {
    await prisma.emailInsight.create({
      data: { ...source, kind: "status_change", applicationId: decision.applicationId, outcome: "ignored" },
    });
    return { wrote: true };
  }

  if (decision.action === "create") {
    const app = await prisma.$transaction(async (tx) => {
      const created = await tx.application.create({
        data: {
          userId, company: decision.company, title: decision.title ?? ROLE_PLACEHOLDER,
          status: decision.status, appliedAt: email.receivedAt, source: "Email",
        },
      });
      await tx.applicationEvent.create({
        data: { applicationId: created.id, userId, type: "created", toStatus: decision.status, summary: "Added from email" },
      });
      await tx.emailInsight.create({
        data: {
          ...source, kind: "new_application", suggestedStatus: decision.status,
          applicationId: created.id, company: decision.company, title: decision.title,
          outcome: "auto_applied",
        },
      });
      return created;
    });
    return {
      wrote: true,
      created: { applicationId: app.id, company: app.company, title: app.title, status: app.status },
    };
  }

  if (decision.action === "auto_apply") {
    await prisma.application.update({
      where: { id: decision.applicationId },
      data: {
        status: decision.toStatus,
        appliedAt: decision.toStatus === "applied" ? email.receivedAt : undefined,
      },
    });
    await recordApplicationEvent({
      applicationId: decision.applicationId,
      userId,
      type: "email_detected",
      fromStatus: decision.fromStatus,
      toStatus: decision.toStatus,
    });
    await prisma.emailInsight.create({
      data: {
        ...source, kind: "status_change", suggestedStatus: decision.toStatus,
        applicationId: decision.applicationId, outcome: "auto_applied",
      },
    });
    return { wrote: true };
  }

  if (decision.action === "suggest_status") {
    await prisma.emailInsight.create({
      data: {
        ...source, kind: "status_change", suggestedStatus: decision.suggestedStatus,
        applicationId: decision.applicationId, outcome: "suggested",
      },
    });
    return { wrote: true };
  }

  // suggest_new
  await prisma.emailInsight.create({
    data: {
      ...source, kind: "new_application", suggestedStatus: decision.suggestedStatus,
      company: decision.company, title: decision.title, outcome: "suggested",
    },
  });
  return { wrote: true };
}
```

- [ ] **Step 5: Run to verify pass**

Run: `pnpm test src/lib/gmail/apply.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260923120000_email_outcome_ignored src/lib/gmail/apply.ts src/lib/gmail/apply.test.ts
git commit -m "feat(gmail): auto-create applications from email; ledger ignored mail

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `syncConnection` + Trigger task rewrite

**Files:**
- Create: `src/lib/gmail/sync.ts`
- Test: `src/lib/gmail/sync.test.ts`
- Modify: `src/trigger/sync-gmail.ts` (whole file)
- Modify: `src/lib/gmail/client.ts` (remove `listHistory`, `listRecentMessages`), `src/lib/gmail/client.test.ts` (remove the `listRecentMessages` describe + import)
- Delete: `src/lib/gmail/relevance.ts`, `src/lib/gmail/relevance.test.ts`

**Interfaces:**
- Consumes: `buildSearchQueries`, `syncWindowStart` (T1); `searchMessages`, `getMessage`, `FetchedMessage.receivedAt` (T2); `classifyEmail` w/ `receivedAt` (T3); `matchApplication`, `AppCandidate` (T4); `decideEmailAction` (T5); `applyDecision`, `ApplyResult` (T6).
- Produces:
  - `MAX_PER_RUN = 150`
  - `syncConnection(conn: { userId: string; lastSyncedAt: Date | null }, accessToken: string, now?: Date): Promise<SyncResult>`
  - `SyncResult = { found: number; processed: number; failed: number; capped: boolean }`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/gmail/sync.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const appFindMany = vi.fn();
const insightFindMany = vi.fn();
const connUpdate = vi.fn().mockResolvedValue({});
const search = vi.fn();
const getMsg = vi.fn();
const classify = vi.fn();
const apply = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    application: { findMany: (...a: any) => appFindMany(...a) },
    emailInsight: { findMany: (...a: any) => insightFindMany(...a) },
    gmailConnection: { update: (...a: any) => connUpdate(...a) },
  },
}));
vi.mock("@/lib/gmail/client", () => ({
  searchMessages: (...a: any) => search(...a),
  getMessage: (...a: any) => getMsg(...a),
}));
vi.mock("@/lib/gmail/classify", () => ({ classifyEmail: (...a: any) => classify(...a) }));
vi.mock("@/lib/gmail/apply", () => ({ applyDecision: (...a: any) => apply(...a) }));

import { syncConnection, MAX_PER_RUN } from "@/lib/gmail/sync";

const now = new Date("2026-09-23T12:00:00Z");
const conn = { userId: "u1", lastSyncedAt: new Date("2026-09-22T12:00:00Z") };

function msg(id: string, day: number, subject = "s") {
  return { id, threadId: `t-${id}`, from: "no-reply@roblox.com", subject, snippet: "", body: "", receivedAt: new Date(Date.UTC(2026, 8, day)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  appFindMany.mockResolvedValue([]);
  insightFindMany.mockResolvedValue([]);
  search.mockResolvedValue([]);
  apply.mockResolvedValue({ wrote: true });
});

describe("syncConnection", () => {
  it("classifies a message returned by several queries once", async () => {
    search.mockResolvedValue(["0a"]);
    getMsg.mockResolvedValue(msg("0a", 20));
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    const res = await syncConnection(conn, "tok", now);

    expect(search.mock.calls.length).toBeGreaterThan(1);
    expect(getMsg).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ found: 1, processed: 1, failed: 0, capped: false });
  });

  it("skips messages already in the ledger", async () => {
    search.mockResolvedValue(["0a", "0b"]);
    insightFindMany.mockResolvedValue([{ messageId: "0a" }]);
    getMsg.mockResolvedValue(msg("0b", 20));
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    await syncConnection(conn, "tok", now);
    expect(getMsg).toHaveBeenCalledTimes(1);
    expect(getMsg).toHaveBeenCalledWith("tok", "0b");
  });

  it("processes oldest first and matches later mail to an app created earlier in the run", async () => {
    search.mockResolvedValue(["0b", "0a"]); // Gmail returns newest first
    getMsg.mockImplementation(async (_t: string, id: string) =>
      id === "0a" ? msg("0a", 2, "Thanks for applying") : msg("0b", 9, "Update"));
    classify.mockImplementation(async (e: any) =>
      e.subject === "Thanks for applying"
        ? { status: "applied", confidence: 0.95, company: "Roblox", title: "SWE", reason: "" }
        : { status: "rejected", confidence: 0.95, company: "Roblox", title: null, reason: "" });
    apply.mockImplementation(async (_u: string, _e: any, d: any) =>
      d.action === "create"
        ? { wrote: true, created: { applicationId: "new", company: "Roblox", title: "SWE", status: "applied" } }
        : { wrote: true });

    await syncConnection(conn, "tok", now);

    const decisions = apply.mock.calls.map((c) => c[2]);
    expect(decisions[0]).toMatchObject({ action: "create", company: "Roblox" });
    expect(decisions[1]).toEqual({ action: "auto_apply", applicationId: "new", fromStatus: "applied", toStatus: "rejected" });
    expect(apply.mock.calls[0][1].receivedAt).toEqual(new Date(Date.UTC(2026, 8, 2)));
  });

  it("sweeps only active tracked companies", async () => {
    appFindMany.mockResolvedValue([
      { id: "a", company: "Jane Street", title: "SWE", status: "applied" },
      { id: "b", company: "OldCo", title: "SWE", status: "rejected" },
    ]);
    await syncConnection(conn, "tok", now);
    const qs = search.mock.calls.map((c) => c[1] as string).join("\n");
    expect(qs).toContain('"Jane Street"');
    expect(qs).not.toContain('"OldCo"');
  });

  it("advances lastSyncedAt after a clean run", async () => {
    await syncConnection(conn, "tok", now);
    expect(connUpdate).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { lastSyncedAt: now } });
  });

  it("holds lastSyncedAt when a fetch fails, but still processes the rest", async () => {
    search.mockResolvedValue(["0a", "0b"]);
    getMsg.mockImplementation(async (_t: string, id: string) => {
      if (id === "0a") throw Object.assign(new Error("401"), { status: 401 });
      return msg("0b", 20);
    });
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    const res = await syncConnection(conn, "tok", now);
    expect(res).toMatchObject({ processed: 1, failed: 1 });
    expect(connUpdate).not.toHaveBeenCalled();
  });

  it("holds lastSyncedAt when a classification fails", async () => {
    search.mockResolvedValue(["0a"]);
    getMsg.mockResolvedValue(msg("0a", 20));
    classify.mockRejectedValue(new Error("bad json"));
    const res = await syncConnection(conn, "tok", now);
    expect(res).toMatchObject({ processed: 0, failed: 1 });
    expect(apply).not.toHaveBeenCalled();
    expect(connUpdate).not.toHaveBeenCalled();
  });

  it("caps a run and holds lastSyncedAt so the next run continues", async () => {
    const ids = Array.from({ length: MAX_PER_RUN + 5 }, (_, i) => i.toString(16).padStart(4, "0"));
    search.mockResolvedValue(ids);
    getMsg.mockImplementation(async (_t: string, id: string) => msg(id, 20));
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    const res = await syncConnection(conn, "tok", now);
    expect(res).toMatchObject({ found: MAX_PER_RUN + 5, processed: MAX_PER_RUN, capped: true });
    expect(getMsg).not.toHaveBeenCalledWith("tok", ids[ids.length - 1]); // oldest ids first
    expect(connUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/gmail/sync.test.ts`
Expected: FAIL — cannot resolve `@/lib/gmail/sync`.

- [ ] **Step 3: Implement `src/lib/gmail/sync.ts`**

```ts
import type { AppStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { searchMessages, getMessage, type FetchedMessage } from "@/lib/gmail/client";
import { buildSearchQueries, syncWindowStart } from "@/lib/gmail/queries";
import { classifyEmail } from "@/lib/gmail/classify";
import { matchApplication, type AppCandidate } from "@/lib/gmail/match";
import { decideEmailAction } from "@/lib/gmail/decide";
import { applyDecision } from "@/lib/gmail/apply";

/** Messages classified per run; a backfill drains over several hourly runs. */
export const MAX_PER_RUN = 150;

/** Per-query id cap. Listing is cheap; it's fetching + classifying that costs. */
const MAX_PER_QUERY = 2000;

const ACTIVE: ReadonlySet<AppStatus> = new Set(["applied", "interviewing", "offer"]);

export interface SyncResult {
  /** Distinct un-ledgered + ledgered ids the queries returned. */
  found: number;
  processed: number;
  failed: number;
  capped: boolean;
}

/** Gmail ids are hex and grow over time; shorter-then-lexical sorts oldest first. */
function byGmailIdAsc(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

async function ledgeredIds(ids: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await prisma.emailInsight.findMany({
      where: { messageId: { in: ids.slice(i, i + 500) } },
      select: { messageId: true },
    });
    for (const r of rows) seen.add(r.messageId);
  }
  return seen;
}

/**
 * One user's sync: search → skip ledgered → classify oldest-first → write.
 *
 * `lastSyncedAt` only advances when every message in the window was handled.
 * Anything left over (a failure, or the per-run cap) is simply picked up next
 * run, because handled messages are in the ledger and cost nothing to re-see.
 */
export async function syncConnection(
  conn: { userId: string; lastSyncedAt: Date | null },
  accessToken: string,
  now = new Date()
): Promise<SyncResult> {
  const apps = await prisma.application.findMany({
    where: { userId: conn.userId },
    select: { id: true, company: true, title: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  const candidates: AppCandidate[] = apps.map((a) => ({
    applicationId: a.id, company: a.company, title: a.title, status: a.status,
  }));

  const queries = buildSearchQueries({
    after: syncWindowStart(conn.lastSyncedAt, now),
    trackedCompanies: apps.filter((a) => ACTIVE.has(a.status)).map((a) => a.company),
  });

  const ids = new Set<string>();
  for (const q of queries) {
    for (const id of await searchMessages(accessToken, q, { max: MAX_PER_QUERY })) ids.add(id);
  }

  const ledgered = await ledgeredIds([...ids]);
  const fresh = [...ids].filter((id) => !ledgered.has(id)).sort(byGmailIdAsc);
  const batch = fresh.slice(0, MAX_PER_RUN);
  const capped = fresh.length > MAX_PER_RUN;

  let failed = 0;
  const messages: FetchedMessage[] = [];
  for (const id of batch) {
    try {
      messages.push(await getMessage(accessToken, id));
    } catch (err) {
      console.warn(`[sync-gmail] fetch failed for message ${id}`, err);
      failed++;
    }
  }
  // Oldest first, so a confirmation creates the app before its rejection arrives.
  messages.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  let processed = 0;
  for (const msg of messages) {
    try {
      const classification = await classifyEmail({
        from: msg.from, subject: msg.subject, body: msg.body, receivedAt: msg.receivedAt,
      });
      const match = matchApplication(
        { fromEmail: msg.from, company: classification.company, title: classification.title },
        candidates
      );
      const decision = decideEmailAction(classification, match);
      const result = await applyDecision(conn.userId, {
        messageId: msg.id, threadId: msg.threadId, fromEmail: msg.from,
        subject: msg.subject, snippet: msg.snippet,
        confidence: classification.confidence, receivedAt: msg.receivedAt,
      }, decision);
      processed++;

      // Keep the in-memory tracker current so later mail in this run matches it.
      if (result.created) candidates.unshift(result.created);
      if (decision.action === "auto_apply") {
        const c = candidates.find((x) => x.applicationId === decision.applicationId);
        if (c) c.status = decision.toStatus;
      }
    } catch (err) {
      console.warn(`[sync-gmail] processing failed for message ${msg.id}`, err);
      failed++;
    }
  }

  if (failed === 0 && !capped) {
    await prisma.gmailConnection.update({ where: { userId: conn.userId }, data: { lastSyncedAt: now } });
  }

  return { found: ids.size, processed, failed, capped };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/gmail/sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite the Trigger task** — replace `src/trigger/sync-gmail.ts`:

```ts
import { schedules } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { refreshAccessToken } from "@/lib/gmail/oauth";
import { shouldFlagReauth } from "@/lib/gmail/token";
import { syncConnection } from "@/lib/gmail/sync";

export const syncGmail = schedules.task({
  id: "sync-gmail",
  cron: "0 * * * *", // hourly — every 15 min burned the Trigger.dev budget
  // A backfill run classifies up to MAX_PER_RUN messages, one model call each.
  maxDuration: 900,
  run: async () => {
    const connections = await prisma.gmailConnection.findMany({ where: { syncEnabled: true } });
    let processed = 0;

    for (const conn of connections) {
      // Isolate each connection: one user's failure must not abort the others.
      try {
        const token = await refreshAccessToken(conn.userId);
        if (!token.ok) {
          // Distinguish a dead grant from a transient blip: only the former is
          // surfaced to the user, and only the former is worth logging loudly.
          if (shouldFlagReauth(token.reason)) {
            await prisma.gmailConnection.update({
              where: { userId: conn.userId },
              data: { needsReauth: true },
            });
            console.error(
              `[sync-gmail] Gmail grant is dead (${token.reason}) for user ${conn.userId} — flagged for reconnect`
            );
          } else {
            console.warn(`[sync-gmail] transient token failure for user ${conn.userId} — retrying next run`);
          }
          continue;
        }

        // The grant works, so clear any previous warning.
        if (conn.needsReauth) {
          await prisma.gmailConnection.update({
            where: { userId: conn.userId },
            data: { needsReauth: false },
          });
        }

        const result = await syncConnection(conn, token.accessToken);
        processed += result.processed;
        const log = result.capped || result.failed ? console.warn : console.log;
        log(`[sync-gmail] ${conn.userId}: ${JSON.stringify(result)}`);
      } catch (err) {
        console.warn(`[sync-gmail] sync failed for user ${conn.userId}`, err);
      }
    }

    return { connections: connections.length, processed };
  },
});
```

- [ ] **Step 6: Remove dead code**

```bash
git rm src/lib/gmail/relevance.ts src/lib/gmail/relevance.test.ts
```

In `src/lib/gmail/client.ts`, delete `listHistory` (and its docstring) and `listRecentMessages` (and its docstring). In `src/lib/gmail/client.test.ts`, delete the `describe("listRecentMessages", …)` block and drop `listRecentMessages` from the import. Then confirm nothing references them:

Run: `grep -rn "listHistory\|listRecentMessages\|isJobRelevant\|gmail/relevance" src`
Expected: no output.

- [ ] **Step 7: Full suite + typecheck**

Run: `pnpm test && pnpm exec tsc --noEmit`
Expected: all tests PASS; tsc exits 0. (If tsc flags `maxDuration` on `schedules.task`, check `node_modules/@trigger.dev/sdk/dist/commonjs/v3/shared.d.ts` — it documents `maxDuration` as a task option.)

- [ ] **Step 8: Commit**

```bash
git add -A src/lib/gmail src/trigger/sync-gmail.ts
git commit -m "feat(gmail): search-first hourly sync with batched, oldest-first processing

Replaces history.list + the subject-keyword filter with targeted Gmail
queries; lastSyncedAt only advances once a window is fully handled.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Confirm fix, Undo, recent auto-adds

**Files:**
- Modify: `src/lib/applications/actions.ts` (`createManualApplication` returns `Promise<string>`)
- Modify: `src/lib/gmail/suggestions.ts` (confirm branch; add `undoAutoAdd`, `getRecentAutoAdds`, `RecentAutoAdd`)
- Modify: `src/lib/dashboard/summary.ts`, `src/lib/dashboard/summary.test.ts`
- Test: `src/lib/gmail/suggestions.test.ts`

**Interfaces:**
- Consumes: `matchApplication` (T4), `ROLE_PLACEHOLDER` (T5).
- Produces:
  - `createManualApplication(input): Promise<string>` (new application id)
  - `undoAutoAdd(insightId: string): Promise<void>`
  - `getRecentAutoAdds(userId: string, now?: Date): Promise<RecentAutoAdd[]>`
  - `RecentAutoAdd = { id: string; messageId: string; threadId: string | null; fromEmail: string; subject: string | null; createdAt: Date; application: { id: string; company: string; title: string; status: AppStatus } }`
  - `getDashboardSummary` result gains `recentAutoAdds: RecentAutoAdd[]`

- [ ] **Step 1: Write the failing tests** — in `src/lib/gmail/suggestions.test.ts`:

Add mocks at the top (next to the existing ones):

```ts
const appFindMany = vi.fn().mockResolvedValue([]);
const appDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
const insightFindMany = vi.fn().mockResolvedValue([]);
```

Extend the `@/lib/db` mock's `emailInsight` with `findMany: (...a: any) => insightFindMany(...a)` and `application` with `findMany: (...a: any) => appFindMany(...a), deleteMany: (...a: any) => appDeleteMany(...a)`. Make `createManual` resolve to an id: `vi.fn().mockResolvedValue("created-id")`. Extend the import to `import { confirmSuggestion, dismissSuggestion, getSuggestionEmail, undoAutoAdd, getRecentAutoAdds } from "@/lib/gmail/suggestions";` and add `appFindMany.mockClear(); appDeleteMany.mockClear(); insightFindMany.mockClear();` to `beforeEach`.

Add `fromEmail: "no-reply@greenhouse.io"` to the existing "creates a new application…" test's `i2` fixture (confirm now runs `matchApplication`, which reads the sender), and update its final expectation to:

```ts
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i2" }, data: { outcome: "accepted", applicationId: "created-id" } });
```

Update the status_change confirm test's insight expectation to `data: { outcome: "accepted", applicationId: "app1" }`.

Append:

```ts
describe("confirmSuggestion — new_application edge cases", () => {
  it("uses the placeholder when the email named no role", async () => {
    findUnique.mockResolvedValue({
      id: "i4", userId: "u1", kind: "new_application", applicationId: null, fromEmail: "no-reply@ashbyhq.com",
      suggestedStatus: "applied", company: "Valon", title: null,
    });
    await confirmSuggestion("i4");
    expect(createManual).toHaveBeenCalledWith(expect.objectContaining({ company: "Valon", title: "Role not specified" }));
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i4" }, data: { outcome: "accepted", applicationId: "created-id" } });
  });

  it("links to an already-tracked app instead of duplicating it", async () => {
    findUnique.mockResolvedValue({
      id: "i5", userId: "u1", kind: "new_application", applicationId: null,
      fromEmail: "Roblox Assessment <noreply@email.roblox.com>",
      suggestedStatus: "interviewing", company: "Roblox", title: null,
    });
    appFindMany.mockResolvedValue([{ id: "app-roblox", company: "Roblox", title: "SWE", status: "applied" }]);
    await confirmSuggestion("i5");
    expect(createManual).not.toHaveBeenCalled();
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i5" }, data: { outcome: "accepted", applicationId: "app-roblox" } });
  });

  it("does nothing when there is no company at all", async () => {
    findUnique.mockResolvedValue({
      id: "i6", userId: "u1", kind: "new_application", applicationId: null, fromEmail: "x@y.com",
      suggestedStatus: "applied", company: null, title: null,
    });
    await confirmSuggestion("i6");
    expect(createManual).not.toHaveBeenCalled();
    expect(insightUpdate).not.toHaveBeenCalled();
  });
});

describe("undoAutoAdd", () => {
  it("deletes the auto-added app and dismisses the insight", async () => {
    findUnique.mockResolvedValue({ id: "i7", userId: "u1", kind: "new_application", outcome: "auto_applied", applicationId: "app9" });
    await undoAutoAdd("i7");
    expect(appDeleteMany).toHaveBeenCalledWith({ where: { id: "app9", userId: "u1" } });
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i7" }, data: { outcome: "dismissed", applicationId: null } });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("refuses anything that is not an auto-added application", async () => {
    findUnique.mockResolvedValue({ id: "i8", userId: "u1", kind: "status_change", outcome: "auto_applied", applicationId: "app9" });
    await undoAutoAdd("i8");
    expect(appDeleteMany).not.toHaveBeenCalled();
    expect(insightUpdate).not.toHaveBeenCalled();
  });

  it("refuses another user's insight", async () => {
    findUnique.mockResolvedValue({ id: "i9", userId: "other", kind: "new_application", outcome: "auto_applied", applicationId: "app9" });
    await undoAutoAdd("i9");
    expect(appDeleteMany).not.toHaveBeenCalled();
  });
});

describe("getRecentAutoAdds", () => {
  it("queries the last 7 days of live auto-added applications", async () => {
    const now = new Date("2026-09-23T12:00:00Z");
    insightFindMany.mockResolvedValue([{
      id: "i1", messageId: "m1", threadId: "t1", fromEmail: "f", subject: "s", createdAt: now,
      application: { id: "a1", company: "Valon", title: "Role not specified", status: "applied" },
    }]);
    const rows = await getRecentAutoAdds("u1", now);
    expect(insightFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: "u1", kind: "new_application", outcome: "auto_applied",
        applicationId: { not: null }, createdAt: { gte: new Date("2026-09-16T12:00:00Z") },
      },
    }));
    expect(rows[0].application.company).toBe("Valon");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/lib/gmail/suggestions.test.ts`
Expected: FAIL — `undoAutoAdd`/`getRecentAutoAdds` missing; accepted update lacks `applicationId`.

- [ ] **Step 3: Implement**

In `src/lib/applications/actions.ts`, change the signature to `export async function createManualApplication(input: ManualApplicationInput): Promise<string> {` and add `return application.id;` after `revalidatePath("/applications");`.

In `src/lib/gmail/suggestions.ts` add imports:

```ts
import { matchApplication } from "@/lib/gmail/match";
import { ROLE_PLACEHOLDER } from "@/lib/gmail/decide";
```

Replace the body of `confirmSuggestion` from `if (insight.kind === "status_change" …` through the `emailInsight.update` line with:

```ts
  let applicationId: string;

  if (insight.kind === "status_change" && insight.applicationId && insight.suggestedStatus) {
    // Apply the status and log it as email-detected, preserving the "from email"
    // provenance in the Updates feed (same event type as the auto-applied path).
    const app = await prisma.application.findFirst({
      where: { id: insight.applicationId, userId: user.id },
      select: { status: true },
    });
    if (!app) return;
    await prisma.application.update({
      where: { id: insight.applicationId },
      data: {
        status: insight.suggestedStatus,
        appliedAt: insight.suggestedStatus === "applied" ? new Date() : undefined,
      },
    });
    if (app.status !== insight.suggestedStatus) {
      await recordApplicationEvent({
        applicationId: insight.applicationId,
        userId: user.id,
        type: "email_detected",
        fromStatus: app.status,
        toStatus: insight.suggestedStatus,
      });
    }
    revalidatePath("/applications");
    applicationId = insight.applicationId;
  } else if (insight.kind === "new_application" && insight.company) {
    // The app may have been tracked since this was suggested (by hand, or by a
    // later auto-add) — link to it rather than creating a duplicate.
    const apps = await prisma.application.findMany({
      where: { userId: user.id },
      select: { id: true, company: true, title: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    const match = matchApplication(
      { fromEmail: insight.fromEmail, company: insight.company, title: insight.title },
      apps.map((a) => ({ applicationId: a.id, company: a.company, title: a.title, status: a.status }))
    );
    applicationId = match.applicationId ?? await createManualApplication({
      company: insight.company,
      title: insight.title ?? ROLE_PLACEHOLDER,
      status: insight.suggestedStatus ?? "applied",
    });
  } else {
    return;
  }

  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "accepted", applicationId } });
```

(Leave the trailing comment + `refresh();` as-is.)

Append to `src/lib/gmail/suggestions.ts`:

```ts
export interface RecentAutoAdd {
  id: string;
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  subject: string | null;
  createdAt: Date;
  application: { id: string; company: string; title: string; status: AppStatus };
}

const AUTO_ADD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Applications sync added on its own in the last week, so they can be checked (or undone). */
export async function getRecentAutoAdds(userId: string, now = new Date()): Promise<RecentAutoAdd[]> {
  const rows = await prisma.emailInsight.findMany({
    where: {
      userId, kind: "new_application", outcome: "auto_applied",
      applicationId: { not: null }, createdAt: { gte: new Date(now.getTime() - AUTO_ADD_WINDOW_MS) },
    },
    include: { application: { select: { id: true, company: true, title: true, status: true } } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return rows
    .filter((r) => r.application)
    .map((r) => ({
      id: r.id, messageId: r.messageId, threadId: r.threadId, fromEmail: r.fromEmail,
      subject: r.subject, createdAt: r.createdAt, application: r.application!,
    }));
}

/**
 * Take back an application sync added on its own. The insight stays (dismissed)
 * so the same email can never re-create it.
 */
export async function undoAutoAdd(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;
  if (insight.kind !== "new_application" || insight.outcome !== "auto_applied") return;

  if (insight.applicationId) {
    await prisma.application.deleteMany({ where: { id: insight.applicationId, userId: user.id } });
  }
  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "dismissed", applicationId: null } });
  revalidatePath("/applications");
  refresh();
}
```

In `src/lib/dashboard/summary.ts`: import `getRecentAutoAdds` alongside `getPendingSuggestions`, add it to the `Promise.all` (destructure as `recentAutoAdds`), and include `recentAutoAdds` in the returned object. In `src/lib/dashboard/summary.test.ts`, add `getRecentAutoAdds: vi.fn().mockResolvedValue([]),` to the `@/lib/gmail/suggestions` mock and `recentAutoAdds: [],` to the expected object.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/lib/gmail/suggestions.test.ts src/lib/dashboard/summary.test.ts src/lib/applications/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/actions.ts src/lib/gmail/suggestions.ts src/lib/gmail/suggestions.test.ts src/lib/dashboard/summary.ts src/lib/dashboard/summary.test.ts
git commit -m "feat(gmail): undo auto-adds; confirm works without a title and dedupes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: "From your email" dashboard card

**Files:**
- Modify: `src/components/dashboard/suggested-updates.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx:41-44`
- Test: `src/components/dashboard/suggested-updates.test.tsx` (new)

**Interfaces:**
- Consumes: `RecentAutoAdd`, `undoAutoAdd` (T8); `PendingSuggestion`, `confirmSuggestion`, `dismissSuggestion` (existing).
- Produces: `SuggestedUpdates({ suggestions, autoAdds, accountEmail })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/dashboard/suggested-updates.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const undo = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/gmail/suggestions", () => ({
  confirmSuggestion: vi.fn(), dismissSuggestion: vi.fn(), undoAutoAdd: (...a: any) => undo(...a),
}));
vi.mock("@/components/dashboard/email-preview-dialog", () => ({
  EmailPreviewDialog: ({ subject }: { subject: string }) => <span>{subject}</span>,
}));

import { SuggestedUpdates } from "@/components/dashboard/suggested-updates";

const autoAdd = {
  id: "i1", messageId: "m1", threadId: "t1", fromEmail: "no-reply@ashbyhq.com",
  subject: "Thanks for applying to Valon", createdAt: new Date(),
  application: { id: "a1", company: "Valon", title: "Role not specified", status: "applied" as const },
};
const suggestion = {
  id: "s1", kind: "new_application", suggestedStatus: "applied" as const, company: "Glide", title: null,
  createdAt: new Date(), messageId: "m2", threadId: null, fromEmail: "x@glide.com", subject: "Hi",
  snippet: null, application: null,
};

describe("SuggestedUpdates", () => {
  it("shows auto-added applications with an Undo", () => {
    render(<SuggestedUpdates suggestions={[]} autoAdds={[autoAdd]} />);
    expect(screen.getByText("From your email")).toBeInTheDocument();
    expect(screen.getByText(/Valon — Role not specified/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(undo).toHaveBeenCalledWith("i1");
  });

  it("shows both groups when there is something in each", () => {
    render(<SuggestedUpdates suggestions={[suggestion]} autoAdds={[autoAdd]} />);
    expect(screen.getByText("Added")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
  });

  it("renders nothing when both are empty", () => {
    const { container } = render(<SuggestedUpdates suggestions={[]} autoAdds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test src/components/dashboard/suggested-updates.test.tsx`
Expected: FAIL — no "From your email", no Undo.

- [ ] **Step 3: Implement** — in `src/components/dashboard/suggested-updates.tsx`:

Update imports:

```tsx
import { confirmSuggestion, dismissSuggestion, undoAutoAdd } from "@/lib/gmail/suggestions";
import type { PendingSuggestion, RecentAutoAdd } from "@/lib/gmail/suggestions";
```

Change the component signature and everything from `const visible = …` to the end of the file:

```tsx
export function SuggestedUpdates({
  suggestions,
  autoAdds,
  accountEmail,
}: {
  suggestions: PendingSuggestion[];
  autoAdds: RecentAutoAdd[];
  accountEmail?: string | null;
}) {
```

(keep the existing `acted` / `failed` / `act` block unchanged), then:

```tsx
  const visible = suggestions.filter((s) => !acted[s.id]);
  const added = autoAdds.filter((a) => !acted[a.id]);
  if (visible.length === 0 && added.length === 0) return null;
  const grouped = visible.length > 0 && added.length > 0;

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>From your email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed && (
          <p className="text-xs text-destructive">
            That didn&apos;t go through — try again.
          </p>
        )}

        {added.length > 0 && (
          <section>
            {grouped && <h3 className="mb-1 text-xs font-medium text-muted-foreground">Added</h3>}
            <ul className="space-y-1">
              {added.map((a) => (
                <Row
                  key={a.id}
                  id={a.id}
                  title={`${a.application.company} — ${a.application.title}`}
                  sub="Added to your tracker"
                  status={a.application.status}
                  emailLabel={a.subject ?? a.fromEmail}
                  fromEmail={a.fromEmail}
                  gmailUrl={gmailMessageUrl(a, accountEmail)}
                >
                  <Button type="button" size="sm" variant="ghost" onClick={() => act(a.id, undoAutoAdd)}>
                    Undo
                  </Button>
                </Row>
              ))}
            </ul>
          </section>
        )}

        {visible.length > 0 && (
          <section>
            {grouped && <h3 className="mb-1 text-xs font-medium text-muted-foreground">Needs review</h3>}
            <ul className="space-y-1">
              {visible.map((s) => (
                <Row
                  key={s.id}
                  id={s.id}
                  title={label(s)}
                  sub={context(s)}
                  status={s.suggestedStatus}
                  emailLabel={s.subject ?? s.fromEmail}
                  fromEmail={s.fromEmail}
                  gmailUrl={gmailMessageUrl(s, accountEmail)}
                >
                  <Button type="button" size="sm" variant="default" onClick={() => act(s.id, confirmSuggestion)}>
                    Confirm
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => act(s.id, dismissSuggestion)}>
                    Dismiss
                  </Button>
                </Row>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  id, title, sub, status, emailLabel, fromEmail, gmailUrl, children,
}: {
  id: string;
  title: string;
  sub: string;
  status: string | null;
  emailLabel: string;
  fromEmail: string;
  gmailUrl: string | null;
  children: React.ReactNode;
}) {
  return (
    <li className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="block truncate font-medium">{title}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {sub && <span className="flex-none">{sub}</span>}
          {sub && <span className="flex-none">·</span>}
          <EmailPreviewDialog insightId={id} subject={emailLabel} fromEmail={fromEmail} gmailUrl={gmailUrl} />
        </p>
      </div>
      {status && <Badge variant="outline" className="capitalize">{status}</Badge>}
      <div className="flex flex-none items-center gap-1">{children}</div>
    </li>
  );
}
```

Add `import type { ReactNode } from "react";` to the imports and type `children` as `ReactNode` (not `React.ReactNode`).

In `src/app/(app)/dashboard/page.tsx`, pass the new prop:

```tsx
          <SuggestedUpdates
            suggestions={summary.pendingSuggestions}
            autoAdds={summary.recentAutoAdds}
            accountEmail={user.email}
          />
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test src/components/dashboard/suggested-updates.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS; tsc exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/suggested-updates.tsx src/components/dashboard/suggested-updates.test.tsx "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): 'From your email' card with auto-added apps + Undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Backfill script, verification, rollout

**Files:**
- Create: `scripts/gmail-backfill.ts`

- [ ] **Step 1: Write the script**

```ts
// Rewind a user's Gmail sync so the hourly task re-scans from a date. Run with:
//
//   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/gmail-backfill.ts <email> [YYYY-MM-DD]
//
// The date defaults to 2026-07-01 (SYNC_FLOOR). lastSyncedAt is set 2 days
// later because each run already overlaps the last sync by 2 days. Already
// processed mail is skipped via the EmailInsight ledger, so this is safe to
// re-run.
import { prisma } from "@/lib/db";
import { SYNC_FLOOR } from "@/lib/gmail/queries";

async function main() {
  const [email, since] = process.argv.slice(2);
  if (!email) throw new Error("usage: gmail-backfill.ts <email> [YYYY-MM-DD]");
  const from = since ? new Date(`${since}T00:00:00Z`) : SYNC_FLOOR;
  if (Number.isNaN(from.getTime())) throw new Error(`bad date: ${since}`);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`no user ${email}`);

  const lastSyncedAt = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);
  await prisma.gmailConnection.update({ where: { userId: user.id }, data: { lastSyncedAt } });
  console.log(`Gmail sync for ${email} rewound: next run scans from ${from.toISOString().slice(0, 10)}`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Full verification**

Run: `pnpm test && pnpm exec tsc --noEmit && pnpm build`
Expected: all tests PASS, tsc exit 0, Next build succeeds. Report actual counts.

- [ ] **Step 3: Commit**

```bash
git add scripts/gmail-backfill.ts
git commit -m "chore(gmail): backfill script to rewind sync to a date

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Rollout — STOP and ask the user before each of these (they touch production):**
  1. Apply the migration: `pnpm prisma migrate deploy` (additive enum value; must land before any code that writes `ignored`).
  2. Push `main` (Vercel deploys the dashboard).
  3. Confirm Ben has unblocked the Trigger.dev project (runs execute again), then `pnpm deploy:trigger`.
  4. Run the backfill: `npx tsx --tsconfig tsconfig.json --env-file=.env scripts/gmail-backfill.ts bensidebotham89@gmail.com`.
  5. After the first hourly run, check `mcp__trigger__list_runs` (prod, `sync-gmail`) for a COMPLETED run and its logged `SyncResult`.
