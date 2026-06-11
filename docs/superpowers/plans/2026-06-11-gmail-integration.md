# Gmail Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a user's Gmail so Hone reads job-search emails, auto-applies high-confidence status changes (surfacing them in the dashboard Updates feed), and offers lower-confidence changes as confirmable suggestions.

**Architecture:** Incremental Google OAuth (`gmail.readonly`) layered onto the existing Auth.js sign-in; tokens persisted on the `Account` row via the `signIn` callback. A Trigger.dev scheduled task polls each connection through Gmail's History API, gates messages with a pure heuristic before any model call, classifies survivors with Gemini, matches them to tracked Applications, and either auto-applies (`recordApplicationEvent({type: "email_detected"})`) or logs a suggestion. Suggestions render on the dashboard digest.

**Tech Stack:** Next.js (App Router, customized — read `node_modules/next/dist/docs` before any route/auth change), Auth.js v5 (`next-auth` beta), Prisma + Neon, Trigger.dev v4, Gemini via `@google/genai` (`analyze()`), Vitest, Zod v4.

---

## File Structure

**Create:**
- `src/lib/gmail/relevance.ts` — pure heuristic job-relevance gate
- `src/lib/gmail/relevance.test.ts`
- `src/lib/gmail/classify.ts` — Gemini prompt + zod schema + `classifyEmail()`
- `src/lib/gmail/classify.test.ts`
- `src/lib/gmail/match.ts` — pure email→Application matching
- `src/lib/gmail/match.test.ts`
- `src/lib/gmail/decide.ts` — pure decision function (auto-apply / suggest / skip)
- `src/lib/gmail/decide.test.ts`
- `src/lib/gmail/client.ts` — thin fetch wrapper over Gmail REST API
- `src/lib/gmail/oauth.ts` — connect/disconnect server actions + `refreshAccessToken`
- `src/lib/gmail/apply.ts` — persist a decision (insight + event/status write)
- `src/lib/gmail/suggestions.ts` — `getPendingSuggestions`, confirm/dismiss server actions
- `src/lib/gmail/suggestions.test.ts`
- `src/trigger/sync-gmail.ts` — scheduled orchestration task
- `src/components/dashboard/suggested-updates.tsx` — dashboard suggestions card

**Modify:**
- `prisma/schema.prisma` — `email_detected` enum value, `EmailOutcome` enum, `GmailConnection` + `EmailInsight` models, User/Application back-relations
- `src/lib/auth.ts` — `signIn` callback persisting Gmail tokens; keep base scope minimal
- `src/lib/applications/events.ts` — default summary for `email_detected`
- `src/lib/applications/events.test.ts` — cover the new default summary
- `src/lib/dashboard/summary.ts` — include `pendingSuggestions`
- `src/app/(app)/dashboard/page.tsx` — render `SuggestedUpdates`
- `src/app/(app)/settings/page.tsx` — Gmail connect/disconnect card

**TDD note:** The pure modules (`relevance`, `classify`, `match`, `decide`), the events summary, and the suggestion server actions are unit-tested. The OAuth glue (`oauth.ts`), the network client (`client.ts`), and the orchestration task (`sync-gmail.ts`) are integration code verified manually via the real connect flow (steps in Task 12) — do not fake a passing unit test for network/OAuth code.

---

## Task 1: Prisma schema — enums, models, relations

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `email_detected` enum value**

In `prisma/schema.prisma`, replace the `AppEventType` enum:

```prisma
enum AppEventType {
  created
  status_change
  email_detected
}
```

- [ ] **Step 2: Add the `EmailOutcome` enum**

Add directly below `AppEventType`:

```prisma
enum EmailOutcome {
  auto_applied
  suggested
  accepted
  dismissed
}
```

- [ ] **Step 3: Add the two models**

Add at the end of the file:

```prisma
model GmailConnection {
  userId       String    @id
  historyId    String?
  syncEnabled  Boolean   @default(true)
  connectedAt  DateTime  @default(now())
  lastSyncedAt DateTime?
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model EmailInsight {
  id              String       @id @default(cuid())
  userId          String
  messageId       String       @unique
  threadId        String?
  fromEmail       String
  subject         String?
  snippet         String?
  kind            String
  suggestedStatus AppStatus?
  applicationId   String?
  company         String?
  title           String?
  confidence      Float
  outcome         EmailOutcome
  createdAt       DateTime     @default(now())
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  application     Application? @relation(fields: [applicationId], references: [id], onDelete: SetNull)

  @@index([userId, outcome])
}
```

- [ ] **Step 4: Add back-relations**

On `model User`, add below `appEvents`:

```prisma
  gmailConnection      GmailConnection?
  emailInsights        EmailInsight[]
```

On `model Application`, add below `events`:

```prisma
  emailInsights EmailInsight[]
```

- [ ] **Step 5: Migrate and regenerate**

Run: `npx prisma migrate dev --name gmail_integration`
Expected: migration created and applied, `prisma generate` runs clean.

- [ ] **Step 6: Restart the dev server**

The dev server runs on port 3050. Restart it now (Turbopack won't reload the regenerated Prisma client). Verify the app still loads.

- [ ] **Step 7: Commit**

```bash
git add prisma/
git commit -m "feat(db): Gmail integration schema (email_detected, GmailConnection, EmailInsight)"
```

---

## Task 2: `email_detected` default summary

**Files:**
- Modify: `src/lib/applications/events.ts`
- Test: `src/lib/applications/events.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/applications/events.test.ts`:

```typescript
it("creates an email_detected event with a default 'from email' summary", async () => {
  await recordApplicationEvent({
    applicationId: "a1",
    userId: "u1",
    type: "email_detected",
    fromStatus: "applied",
    toStatus: "rejected",
  });
  const args = create.mock.calls.at(-1)![0];
  expect(args.data.type).toBe("email_detected");
  expect(args.data.summary).toBe("Rejected (detected from email)");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/applications/events.test.ts`
Expected: FAIL — summary is `undefined`, not `"Rejected (detected from email)"`.

- [ ] **Step 3: Implement the default summary**

In `src/lib/applications/events.ts`, in `defaultSummary`, add before the final `return undefined;`:

```typescript
  if (input.type === "email_detected" && input.toStatus) {
    return `${STATUS_LABEL[input.toStatus]} (detected from email)`;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/applications/events.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/applications/events.ts src/lib/applications/events.test.ts
git commit -m "feat(events): default summary for email_detected"
```

---

## Task 3: Relevance gate (pure heuristic)

**Files:**
- Create: `src/lib/gmail/relevance.ts`
- Test: `src/lib/gmail/relevance.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/gmail/relevance.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { isJobRelevant } from "@/lib/gmail/relevance";

describe("isJobRelevant", () => {
  it("accepts known ATS sender domains", () => {
    expect(isJobRelevant({ fromEmail: "no-reply@greenhouse.io", subject: "Hi" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "jobs@hire.lever.co", subject: "x" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "a@us.greenhouse-mail.io", subject: "x" })).toBe(true);
  });

  it("accepts job keywords in the subject regardless of sender", () => {
    expect(isJobRelevant({ fromEmail: "careers@acme.com", subject: "Your application to Acme" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "x@y.com", subject: "Unfortunately, an update on your candidacy" })).toBe(true);
    expect(isJobRelevant({ fromEmail: "x@y.com", subject: "Next steps for your interview" })).toBe(true);
  });

  it("rejects unrelated mail", () => {
    expect(isJobRelevant({ fromEmail: "news@substack.com", subject: "Your weekly digest" })).toBe(false);
    expect(isJobRelevant({ fromEmail: "receipts@amazon.com", subject: "Your order shipped" })).toBe(false);
  });

  it("is case-insensitive and tolerates display-name From headers", () => {
    expect(isJobRelevant({ fromEmail: "Acme Recruiting <no-reply@GREENHOUSE.IO>", subject: "x" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gmail/relevance.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gmail/relevance.ts`:

```typescript
// Pure heuristic gate: decides whether an email is plausibly job-search related
// BEFORE any model call. Non-relevant mail is never sent to Gemini or stored.

const ATS_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com",
  "myworkday.com", "workday.com", "icims.com", "smartrecruiters.com",
  "bamboohr.com", "jobvite.com", "taleo.net", "successfactors.com",
  "breezy.hr", "workable.com", "applytojob.com", "rippling.com",
];

const SUBJECT_KEYWORDS = [
  "application", "applied", "interview", "candidate", "candidacy",
  "position", "the role", "your offer", "unfortunately", "next step",
  "moving forward", "thank you for applying", "status of your",
  "recruiter", "phone screen", "assessment",
];

/** Extract the bare email address from a possibly display-name-wrapped From header. */
function extractAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

function domainOf(from: string): string {
  const addr = extractAddress(from);
  const at = addr.lastIndexOf("@");
  return at === -1 ? "" : addr.slice(at + 1);
}

export function isJobRelevant(input: { fromEmail: string; subject: string }): boolean {
  const domain = domainOf(input.fromEmail);
  if (ATS_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;

  const subject = (input.subject ?? "").toLowerCase();
  return SUBJECT_KEYWORDS.some((kw) => subject.includes(kw));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gmail/relevance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/relevance.ts src/lib/gmail/relevance.test.ts
git commit -m "feat(gmail): job-relevance heuristic gate"
```

---

## Task 4: Classifier (Gemini prompt + schema)

**Files:**
- Create: `src/lib/gmail/classify.ts`
- Test: `src/lib/gmail/classify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/gmail/classify.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import {
  buildClassifyPrompt,
  ClassificationSchema,
  classifyEmail,
} from "@/lib/gmail/classify";

describe("buildClassifyPrompt", () => {
  it("includes the email fields and asks for the JSON shape", () => {
    const { system, prompt } = buildClassifyPrompt({
      from: "no-reply@greenhouse.io",
      subject: "Acme — application received",
      body: "Thanks for applying to the Software Engineer role.",
    });
    expect(prompt).toContain("Acme — application received");
    expect(prompt).toContain("Software Engineer");
    expect(system).toMatch(/status/i);
    expect(system).toMatch(/confidence/i);
  });
});

describe("ClassificationSchema", () => {
  it("accepts a well-formed classification", () => {
    const ok = ClassificationSchema.safeParse({
      status: "rejected", confidence: 0.91, company: "Acme", title: "SWE", reason: "says unfortunately",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects an out-of-range confidence", () => {
    expect(ClassificationSchema.safeParse({
      status: "applied", confidence: 1.4, company: null, title: null, reason: "x",
    }).success).toBe(false);
  });
  it("rejects an unknown status", () => {
    expect(ClassificationSchema.safeParse({
      status: "ghosted", confidence: 0.5, company: null, title: null, reason: "x",
    }).success).toBe(false);
  });
});

describe("classifyEmail", () => {
  it("returns the validated classification from the model", async () => {
    const client = {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"status":"interviewing","confidence":0.86,"company":"Acme","title":"SWE","reason":"invites to schedule"}',
      }),
    };
    const out = await classifyEmail(
      { from: "x@acme.com", subject: "Interview", body: "Let's schedule" },
      { client }
    );
    expect(out.status).toBe("interviewing");
    expect(out.confidence).toBeCloseTo(0.86);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gmail/classify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gmail/classify.ts`:

```typescript
import { z } from "zod";
import { analyze, type ModelLike } from "@/lib/ai/provider";

export const EMAIL_STATUSES = ["applied", "interviewing", "offer", "rejected", "none"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const ClassificationSchema = z.object({
  status: z.enum(EMAIL_STATUSES),
  confidence: z.number().min(0).max(1),
  company: z.string().nullable(),
  title: z.string().nullable(),
  reason: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export interface EmailForClassify {
  from: string;
  subject: string;
  body: string;
}

export function buildClassifyPrompt(email: EmailForClassify): { system: string; prompt: string } {
  const system = [
    "You classify a single job-search email into the applicant's application status.",
    'Return ONLY JSON: {"status","confidence","company","title","reason"}.',
    `status is one of: ${EMAIL_STATUSES.join(", ")}.`,
    "- applied: confirmation that an application was received.",
    "- interviewing: an interview invite, scheduling, recruiter screen, or assessment.",
    "- offer: a job offer is extended.",
    "- rejected: the candidate is declined / not moving forward.",
    "- none: not about the applicant's own application status (newsletter, job alert, marketing).",
    "confidence is 0..1 (how sure you are of the status).",
    "company and title: the hiring company and role if identifiable, else null.",
    "reason: one short sentence of justification.",
  ].join("\n");

  const prompt = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    "Body:",
    email.body.slice(0, 2000),
  ].join("\n");

  return { system, prompt };
}

export async function classifyEmail(
  email: EmailForClassify,
  opts: { client?: ModelLike } = {}
): Promise<Classification> {
  const { system, prompt } = buildClassifyPrompt(email);
  const raw = await analyze<unknown>({ system, prompt }, opts);
  return ClassificationSchema.parse(raw);
}
```

- [ ] **Step 4: Export `ModelLike` from the provider (if not already)**

Confirm `src/lib/ai/provider.ts` exports `ModelLike` (it declares `export interface ModelLike`). No change expected; if it is not exported, add `export` to the interface.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/gmail/classify.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gmail/classify.ts src/lib/gmail/classify.test.ts
git commit -m "feat(gmail): Gemini email classifier + schema"
```

---

## Task 5: Matcher (pure email→Application)

**Files:**
- Create: `src/lib/gmail/match.ts`
- Test: `src/lib/gmail/match.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/gmail/match.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchApplication, type AppCandidate } from "@/lib/gmail/match";

const candidates: AppCandidate[] = [
  { applicationId: "app-acme", company: "Acme Inc.", status: "applied" },
  { applicationId: "app-globex", company: "Globex Corporation", status: "saved" },
];

describe("matchApplication", () => {
  it("matches on classified company name, ignoring legal suffixes", () => {
    const m = matchApplication({ fromEmail: "no-reply@greenhouse.io", company: "Acme" }, candidates);
    expect(m.applicationId).toBe("app-acme");
    expect(m.currentStatus).toBe("applied");
  });

  it("matches on a direct-company sender domain when classified company is null", () => {
    const m = matchApplication({ fromEmail: "careers@globex.com", company: null }, candidates);
    expect(m.applicationId).toBe("app-globex");
  });

  it("returns null when nothing matches", () => {
    const m = matchApplication({ fromEmail: "x@initech.com", company: "Initech" }, candidates);
    expect(m.applicationId).toBeNull();
    expect(m.currentStatus).toBeNull();
  });

  it("does not match on a generic ATS sender domain", () => {
    const m = matchApplication({ fromEmail: "no-reply@lever.co", company: null }, candidates);
    expect(m.applicationId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gmail/match.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gmail/match.ts`:

```typescript
import type { AppStatus } from "@prisma/client";

export interface AppCandidate {
  applicationId: string;
  company: string;
  status: AppStatus;
}

export interface MatchResult {
  applicationId: string | null;
  currentStatus: AppStatus | null;
}

// ATS senders share a domain across many companies, so the domain root is not a
// company signal — only direct-company domains are.
const GENERIC_DOMAINS = new Set([
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com",
  "myworkday.com", "workday.com", "icims.com", "smartrecruiters.com",
  "bamboohr.com", "jobvite.com", "taleo.net", "successfactors.com",
  "breezy.hr", "workable.com", "applytojob.com", "rippling.com",
  "gmail.com", "googlemail.com", "outlook.com", "yahoo.com",
]);

function normalizeCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function senderCompanyToken(fromEmail: string): string | null {
  const match = fromEmail.match(/<([^>]+)>/);
  const addr = (match ? match[1] : fromEmail).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  const domain = addr.slice(at + 1);
  if (GENERIC_DOMAINS.has(domain)) return null;
  const label = domain.split(".")[0]; // "globex" from "globex.com"
  return label ? normalizeCompany(label) : null;
}

export function matchApplication(
  input: { fromEmail: string; company: string | null },
  candidates: AppCandidate[]
): MatchResult {
  const norm = candidates.map((c) => ({ ...c, key: normalizeCompany(c.company) }));

  // 1) Match on the classified company name (fuzzy on normalized form).
  if (input.company) {
    const target = normalizeCompany(input.company);
    if (target) {
      const hit = norm.find((c) => c.key === target || c.key.includes(target) || target.includes(c.key));
      if (hit) return { applicationId: hit.applicationId, currentStatus: hit.status };
    }
  }

  // 2) Fall back to a direct-company sender domain.
  const token = senderCompanyToken(input.fromEmail);
  if (token) {
    const hit = norm.find((c) => c.key === token || c.key.includes(token) || token.includes(c.key));
    if (hit) return { applicationId: hit.applicationId, currentStatus: hit.status };
  }

  return { applicationId: null, currentStatus: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gmail/match.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/match.ts src/lib/gmail/match.test.ts
git commit -m "feat(gmail): email-to-application matcher"
```

---

## Task 6: Decision function (pure)

**Files:**
- Create: `src/lib/gmail/decide.ts`
- Test: `src/lib/gmail/decide.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/gmail/decide.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { decideEmailAction, AUTO_APPLY_THRESHOLD } from "@/lib/gmail/decide";
import type { Classification } from "@/lib/gmail/classify";

const base: Classification = { status: "rejected", confidence: 0.95, company: "Acme", title: "SWE", reason: "x" };

describe("decideEmailAction", () => {
  it("auto-applies a matched, high-confidence status change", () => {
    const d = decideEmailAction(base, { applicationId: "a1", currentStatus: "applied" });
    expect(d).toEqual({ action: "auto_apply", applicationId: "a1", fromStatus: "applied", toStatus: "rejected" });
  });

  it("suggests when matched but below the confidence threshold", () => {
    const d = decideEmailAction({ ...base, confidence: 0.5 }, { applicationId: "a1", currentStatus: "applied" });
    expect(d).toEqual({ action: "suggest_status", applicationId: "a1", suggestedStatus: "rejected" });
  });

  it("skips when the matched application is already in that status", () => {
    const d = decideEmailAction(base, { applicationId: "a1", currentStatus: "rejected" });
    expect(d.action).toBe("skip");
  });

  it("suggests a new application when unmatched (any confidence)", () => {
    const d = decideEmailAction(base, { applicationId: null, currentStatus: null });
    expect(d).toEqual({ action: "suggest_new", suggestedStatus: "rejected", company: "Acme", title: "SWE" });
  });

  it("skips status 'none'", () => {
    const d = decideEmailAction({ ...base, status: "none" }, { applicationId: null, currentStatus: null });
    expect(d.action).toBe("skip");
  });

  it("threshold is 0.8", () => {
    expect(AUTO_APPLY_THRESHOLD).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gmail/decide.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gmail/decide.ts`:

```typescript
import type { AppStatus } from "@prisma/client";
import type { Classification } from "@/lib/gmail/classify";
import type { MatchResult } from "@/lib/gmail/match";

export const AUTO_APPLY_THRESHOLD = 0.8;

export type Decision =
  | { action: "auto_apply"; applicationId: string; fromStatus: AppStatus; toStatus: AppStatus }
  | { action: "suggest_status"; applicationId: string; suggestedStatus: AppStatus }
  | { action: "suggest_new"; suggestedStatus: AppStatus; company: string | null; title: string | null }
  | { action: "skip"; reason: string };

export function decideEmailAction(c: Classification, m: MatchResult): Decision {
  if (c.status === "none") return { action: "skip", reason: "status none" };

  // status is now one of the AppStatus values (applied|interviewing|offer|rejected).
  const toStatus = c.status as AppStatus;

  if (m.applicationId) {
    if (m.currentStatus === toStatus) return { action: "skip", reason: "already in status" };
    if (c.confidence >= AUTO_APPLY_THRESHOLD) {
      return { action: "auto_apply", applicationId: m.applicationId, fromStatus: m.currentStatus!, toStatus };
    }
    return { action: "suggest_status", applicationId: m.applicationId, suggestedStatus: toStatus };
  }

  return { action: "suggest_new", suggestedStatus: toStatus, company: c.company, title: c.title };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gmail/decide.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/decide.ts src/lib/gmail/decide.test.ts
git commit -m "feat(gmail): email action decision function"
```

---

## Task 7: Persist a decision (insight + event/status write)

**Files:**
- Create: `src/lib/gmail/apply.ts`

This is DB-glue (mirrors `actions.ts`). No new unit test — its branches are exercised via the decision tests above and the Task 12 manual run. Keep it small and obviously correct.

- [ ] **Step 1: Implement**

Create `src/lib/gmail/apply.ts`:

```typescript
import { prisma } from "@/lib/db";
import { recordApplicationEvent } from "@/lib/applications/events";
import type { Decision } from "@/lib/gmail/decide";

export interface IncomingEmail {
  messageId: string;
  threadId: string | null;
  fromEmail: string;
  subject: string | null;
  snippet: string | null;
  confidence: number;
}

/**
 * Persist the outcome of one classified email. Idempotent on messageId:
 * if an insight already exists for this message, do nothing.
 * Returns true if a row was written.
 */
export async function applyDecision(
  userId: string,
  email: IncomingEmail,
  decision: Decision
): Promise<boolean> {
  if (decision.action === "skip") return false;

  const existing = await prisma.emailInsight.findUnique({
    where: { messageId: email.messageId },
    select: { id: true },
  });
  if (existing) return false;

  if (decision.action === "auto_apply") {
    await prisma.application.update({
      where: { id: decision.applicationId },
      data: {
        status: decision.toStatus,
        appliedAt: decision.toStatus === "applied" ? new Date() : undefined,
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
        userId, messageId: email.messageId, threadId: email.threadId,
        fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
        kind: "status_change", suggestedStatus: decision.toStatus,
        applicationId: decision.applicationId, confidence: email.confidence,
        outcome: "auto_applied",
      },
    });
    return true;
  }

  if (decision.action === "suggest_status") {
    await prisma.emailInsight.create({
      data: {
        userId, messageId: email.messageId, threadId: email.threadId,
        fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
        kind: "status_change", suggestedStatus: decision.suggestedStatus,
        applicationId: decision.applicationId, confidence: email.confidence,
        outcome: "suggested",
      },
    });
    return true;
  }

  // suggest_new
  await prisma.emailInsight.create({
    data: {
      userId, messageId: email.messageId, threadId: email.threadId,
      fromEmail: email.fromEmail, subject: email.subject, snippet: email.snippet,
      kind: "new_application", suggestedStatus: decision.suggestedStatus,
      company: decision.company, title: decision.title, confidence: email.confidence,
      outcome: "suggested",
    },
  });
  return true;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in `src/lib/gmail/apply.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/gmail/apply.ts
git commit -m "feat(gmail): persist email decisions (insight + event)"
```

---

## Task 8: OAuth — token persistence + connect/disconnect + refresh

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/gmail/oauth.ts`

OAuth glue — verified in Task 12, not unit-tested.

- [ ] **Step 1: Read the relevant Next.js / Auth.js guidance**

This is a customized Next.js. Skim `node_modules/next/dist/docs/01-app` for server actions and auth before editing. Confirm the `signIn` third-argument (`authorizationParams`) shape in `node_modules/next-auth/index.d.ts` (already verified: `Record<string,string>` is accepted).

- [ ] **Step 2: Persist Gmail tokens in the `signIn` callback**

In `src/lib/auth.ts`, add a `signIn` callback alongside the existing `session` callback. The PrismaAdapter does not reliably update tokens on re-auth, so we own that write. Replace the `callbacks` block:

```typescript
  callbacks: {
    async signIn({ user, account }) {
      // When the Connect-Gmail flow re-auths with gmail.readonly, capture the
      // refreshed tokens onto the existing Account row (adapter won't).
      if (account?.provider === "google" && account.scope?.includes("gmail.readonly")) {
        await prisma.account.updateMany({
          where: { provider: "google", providerAccountId: account.providerAccountId },
          data: {
            access_token: account.access_token,
            expires_at: account.expires_at,
            scope: account.scope,
            // Google only returns a refresh_token with prompt=consent; don't clobber with undefined.
            ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
          },
        });
        // Mark the connection live; seed historyId lazily on first sync.
        if (user?.id) {
          await prisma.gmailConnection.upsert({
            where: { userId: user.id },
            create: { userId: user.id, syncEnabled: true },
            update: { syncEnabled: true },
          });
        }
      }
      return true;
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
```

Note: `user.id` is available in the `signIn` callback for database-session OAuth because the adapter resolves the user before this callback. If, during Task 12, `user.id` is observed to be undefined here, move the `gmailConnection.upsert` into the connect server action (Step 3) right after `signIn` returns instead.

- [ ] **Step 3: Create the OAuth helper module**

Create `src/lib/gmail/oauth.ts`:

```typescript
"use server";

import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const GMAIL_SCOPE = "openid email profile https://www.googleapis.com/auth/gmail.readonly";

/** Start the incremental Gmail OAuth consent (adds gmail.readonly + offline access). */
export async function connectGmail() {
  await signIn(
    "google",
    { redirectTo: "/settings" },
    { scope: GMAIL_SCOPE, access_type: "offline", prompt: "consent" }
  );
}

/** Revoke the Google token, drop the connection and stored insights. */
export async function disconnectGmail() {
  const user = await requireUser();
  const account = await prisma.account.findFirst({
    where: { userId: user.id, provider: "google" },
    select: { access_token: true },
  });

  if (account?.access_token) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: account.access_token }),
    }).catch(() => {}); // best-effort
  }

  await prisma.emailInsight.deleteMany({ where: { userId: user.id } });
  await prisma.gmailConnection.deleteMany({ where: { userId: user.id } });
  await prisma.account.updateMany({
    where: { userId: user.id, provider: "google" },
    data: { scope: "openid email profile" },
  });

  revalidatePath("/settings");
}

interface RefreshResult { accessToken: string }

/**
 * Return a valid Google access token for the user, refreshing via the stored
 * refresh_token when the current one is expired (or within 60s of expiry).
 */
export async function refreshAccessToken(userId: string): Promise<RefreshResult | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account?.refresh_token) return null;

  const stillValid = account.access_token && account.expires_at && account.expires_at - 60 > Math.floor(Date.now() / 1000);
  if (stillValid) return { accessToken: account.access_token! };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in;
  await prisma.account.updateMany({
    where: { userId, provider: "google" },
    data: { access_token: json.access_token, expires_at: expiresAt },
  });
  return { accessToken: json.access_token };
}
```

Note: `refreshAccessToken` is imported by the Trigger task (server-side). It lives in a `"use server"` file but is a plain async function — callable from the task. The two exported actions `connectGmail`/`disconnectGmail` are the form actions.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/gmail/oauth.ts
git commit -m "feat(gmail): incremental OAuth, token persistence, refresh, disconnect"
```

---

## Task 9: Gmail REST client (fetch wrapper)

**Files:**
- Create: `src/lib/gmail/client.ts`

Network glue — verified in Task 12.

- [ ] **Step 1: Implement**

Create `src/lib/gmail/client.ts`:

```typescript
const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gget(accessToken: string, path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Gmail API ${res.status}: ${body}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

/** Current mailbox historyId — used to seed the sync cursor on first run. */
export async function getProfile(accessToken: string): Promise<{ historyId: string }> {
  const json = await gget(accessToken, "/profile");
  return { historyId: String(json.historyId) };
}

/**
 * New message IDs since startHistoryId. Returns { messageIds, latestHistoryId }.
 * Throws an error with .status === 404 when startHistoryId is too old (reseed).
 */
export async function listHistory(
  accessToken: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; latestHistoryId: string | null }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let latest: string | null = null;

  do {
    const qs = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
    if (pageToken) qs.set("pageToken", pageToken);
    const json: any = await gget(accessToken, `/history?${qs.toString()}`);
    if (json.historyId) latest = String(json.historyId);
    for (const h of json.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) ids.add(m.message.id);
      }
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return { messageIds: [...ids], latestHistoryId: latest };
}

export interface FetchedMessage {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  body: string;
}

function header(headers: any[], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Walk the MIME tree for the first text/plain part; fall back to text/html stripped. */
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeB64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    const text = extractBody(part);
    if (text) return text;
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeB64Url(payload.body.data).replace(/<[^>]+>/g, " ");
  }
  return "";
}

export async function getMessage(accessToken: string, id: string): Promise<FetchedMessage> {
  const json: any = await gget(accessToken, `/messages/${id}?format=full`);
  const headers = json.payload?.headers ?? [];
  return {
    id: json.id,
    threadId: json.threadId ?? null,
    from: header(headers, "From"),
    subject: header(headers, "Subject"),
    snippet: json.snippet ?? "",
    body: extractBody(json.payload),
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/gmail/client.ts
git commit -m "feat(gmail): Gmail REST fetch client"
```

---

## Task 10: Suggestions — query + confirm/dismiss actions

**Files:**
- Create: `src/lib/gmail/suggestions.ts`
- Test: `src/lib/gmail/suggestions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/gmail/suggestions.test.ts`. This tests the two action behaviours with a mocked prisma + mocked deps:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const insightUpdate = vi.fn().mockResolvedValue({});
const findUnique = vi.fn();
const recordEvent = vi.fn().mockResolvedValue(undefined);
const updateStatus = vi.fn().mockResolvedValue(undefined);
const createManual = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  prisma: {
    emailInsight: { findUnique: (...a: any) => findUnique(...a), update: (...a: any) => insightUpdate(...a) },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve({ id: "u1" }) }));
vi.mock("@/lib/applications/actions", () => ({
  updateStatus: (...a: any) => updateStatus(...a),
  createManualApplication: (...a: any) => createManual(...a),
}));
vi.mock("@/lib/applications/events", () => ({ recordApplicationEvent: (...a: any) => recordEvent(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { confirmSuggestion, dismissSuggestion } from "@/lib/gmail/suggestions";

beforeEach(() => {
  insightUpdate.mockClear(); findUnique.mockClear(); recordEvent.mockClear();
  updateStatus.mockClear(); createManual.mockClear();
});

describe("confirmSuggestion", () => {
  it("applies a status_change suggestion and marks it accepted", async () => {
    findUnique.mockResolvedValue({
      id: "i1", userId: "u1", kind: "status_change", applicationId: "app1",
      suggestedStatus: "rejected", company: null, title: null,
    });
    await confirmSuggestion("i1");
    expect(updateStatus).toHaveBeenCalledWith("app1", "rejected");
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { outcome: "accepted" } });
  });

  it("creates a new application for a new_application suggestion", async () => {
    findUnique.mockResolvedValue({
      id: "i2", userId: "u1", kind: "new_application", applicationId: null,
      suggestedStatus: "applied", company: "Acme", title: "SWE",
    });
    await confirmSuggestion("i2");
    expect(createManual).toHaveBeenCalledWith(expect.objectContaining({ company: "Acme", title: "SWE", status: "applied" }));
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i2" }, data: { outcome: "accepted" } });
  });

  it("ignores an insight that does not belong to the user", async () => {
    findUnique.mockResolvedValue({ id: "i3", userId: "other", kind: "status_change", applicationId: "app1", suggestedStatus: "rejected" });
    await confirmSuggestion("i3");
    expect(updateStatus).not.toHaveBeenCalled();
    expect(insightUpdate).not.toHaveBeenCalled();
  });
});

describe("dismissSuggestion", () => {
  it("marks the insight dismissed", async () => {
    findUnique.mockResolvedValue({ id: "i1", userId: "u1" });
    await dismissSuggestion("i1");
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { outcome: "dismissed" } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/gmail/suggestions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/gmail/suggestions.ts`:

```typescript
"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { updateStatus, createManualApplication } from "@/lib/applications/actions";
import { revalidatePath } from "next/cache";
import type { AppStatus } from "@prisma/client";

export interface PendingSuggestion {
  id: string;
  kind: string;
  suggestedStatus: AppStatus | null;
  company: string | null;
  title: string | null;
  createdAt: Date;
  application: { id: string; job: { title: string; company: string } } | null;
}

/** Suggested (un-actioned) insights for the dashboard card. */
export async function getPendingSuggestions(userId: string, limit = 8): Promise<PendingSuggestion[]> {
  const rows = await prisma.emailInsight.findMany({
    where: { userId, outcome: "suggested" },
    include: { application: { include: { job: true } } },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    suggestedStatus: r.suggestedStatus,
    company: r.company ?? r.application?.job.company ?? null,
    title: r.title ?? r.application?.job.title ?? null,
    createdAt: r.createdAt,
    application: r.application
      ? { id: r.application.id, job: { title: r.application.job.title, company: r.application.job.company } }
      : null,
  }));
}

export async function confirmSuggestion(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;

  if (insight.kind === "status_change" && insight.applicationId && insight.suggestedStatus) {
    // updateStatus records the status_change event and revalidates.
    await updateStatus(insight.applicationId, insight.suggestedStatus);
  } else if (insight.kind === "new_application" && insight.company && insight.title) {
    await createManualApplication({
      company: insight.company,
      title: insight.title,
      status: insight.suggestedStatus ?? "applied",
    });
  } else {
    return;
  }

  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "accepted" } });
  revalidatePath("/dashboard");
}

export async function dismissSuggestion(insightId: string): Promise<void> {
  const user = await requireUser();
  const insight = await prisma.emailInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.userId !== user.id) return;
  await prisma.emailInsight.update({ where: { id: insightId }, data: { outcome: "dismissed" } });
  revalidatePath("/dashboard");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/gmail/suggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gmail/suggestions.ts src/lib/gmail/suggestions.test.ts
git commit -m "feat(gmail): suggestion query + confirm/dismiss actions"
```

---

## Task 11: Dashboard suggestions card

**Files:**
- Create: `src/components/dashboard/suggested-updates.tsx`
- Modify: `src/lib/dashboard/summary.ts`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add suggestions to the dashboard summary**

In `src/lib/dashboard/summary.ts`, import and include the suggestions:

```typescript
import { getApplicationTrend } from "./application-trend";
import { getNewJobsForUser } from "./new-jobs";
import { getDigestWindow } from "./digest-window";
import { getRecentAppUpdates } from "@/lib/health/app-updates";
import { getPendingSuggestions } from "@/lib/gmail/suggestions";

export async function getDashboardSummary(userId: string) {
  const { windowStart, previousVisitAt } = await getDigestWindow(userId);

  const [applicationTrend, newJobs, appUpdates, pendingSuggestions] = await Promise.all([
    getApplicationTrend(userId),
    getNewJobsForUser(userId, windowStart),
    getRecentAppUpdates(userId, windowStart, previousVisitAt),
    getPendingSuggestions(userId),
  ]);

  return { previousVisitAt, applicationTrend, newJobs, appUpdates, pendingSuggestions };
}
```

- [ ] **Step 2: Build the card component**

Create `src/components/dashboard/suggested-updates.tsx` (mirrors `updates-feed.tsx` styling; server component with form actions):

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmSuggestion, dismissSuggestion } from "@/lib/gmail/suggestions";
import type { PendingSuggestion } from "@/lib/gmail/suggestions";

function label(s: PendingSuggestion): string {
  const company = s.company ?? "a company";
  if (s.kind === "new_application") {
    return s.title ? `Track ${company} — ${s.title}?` : `Track ${company}?`;
  }
  return `${company} → ${s.suggestedStatus ?? "update"}`;
}

export function SuggestedUpdates({ suggestions }: { suggestions: PendingSuggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Suggested updates</CardTitle>
        <span className="text-xs text-muted-foreground">from email</span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="block truncate font-medium">{label(s)}</p>
                <p className="block truncate text-xs text-muted-foreground">
                  {s.kind === "new_application" ? "Not yet tracked" : s.title ?? ""}
                </p>
              </div>
              {s.suggestedStatus && (
                <Badge variant="outline" className="capitalize">{s.suggestedStatus}</Badge>
              )}
              <div className="flex flex-none items-center gap-1">
                <form action={confirmSuggestion.bind(null, s.id)}>
                  <Button type="submit" size="sm" variant="default">Confirm</Button>
                </form>
                <form action={dismissSuggestion.bind(null, s.id)}>
                  <Button type="submit" size="sm" variant="ghost">Dismiss</Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Render it on the dashboard**

In `src/app/(app)/dashboard/page.tsx`, add the import and render it above `UpdatesFeed`:

```tsx
import { SuggestedUpdates } from "@/components/dashboard/suggested-updates";
```

Inside the left column `<div className="space-y-5">`, as the first child:

```tsx
          <SuggestedUpdates suggestions={summary.pendingSuggestions} />
          <UpdatesFeed updates={summary.appUpdates} />
```

- [ ] **Step 4: Verify build + existing dashboard tests**

Run: `npx vitest run src/lib/dashboard/ && npx tsc --noEmit`
Expected: PASS / no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/suggested-updates.tsx src/lib/dashboard/summary.ts "src/app/(app)/dashboard/page.tsx"
git commit -m "feat(dashboard): suggested-updates card from email insights"
```

---

## Task 12: Settings Gmail card

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add a Gmail connection card**

In `src/app/(app)/settings/page.tsx`, add imports and a second card. Read the user's connection + scope state from the DB:

```tsx
import { Mail } from "lucide-react";
import { prisma } from "@/lib/db";
import { connectGmail, disconnectGmail } from "@/lib/gmail/oauth";
```

After the existing Account `<Card>`, inside the same root `<div>`, add:

```tsx
      {await (async () => {
        const connection = await prisma.gmailConnection.findUnique({ where: { userId: user.id } });
        const account = await prisma.account.findFirst({
          where: { userId: user.id, provider: "google" },
          select: { scope: true, refresh_token: true },
        });
        const connected = Boolean(connection) && Boolean(account?.scope?.includes("gmail.readonly")) && Boolean(account?.refresh_token);

        return (
          <Card className="mt-6 max-w-xl hover:shadow-sm transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" aria-hidden="true" /> Gmail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {connected
                  ? `Connected. Hone reads job-search emails and updates your applications automatically.${
                      connection?.lastSyncedAt ? ` Last synced ${connection.lastSyncedAt.toLocaleString()}.` : ""
                    }`
                  : "Connect Gmail so application confirmations, interview invites, offers, and rejections update your tracker automatically."}
              </p>
              {connected ? (
                <form action={disconnectGmail}>
                  <Button type="submit" variant="outline" size="sm">Disconnect</Button>
                </form>
              ) : (
                <form action={connectGmail}>
                  <Button type="submit" size="sm">Connect Gmail</Button>
                </form>
              )}
            </CardContent>
          </Card>
        );
      })()}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification of the OAuth round-trip**

The dev server runs on port 3050. With Google OAuth credentials configured (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`) and `https://www.googleapis.com/auth/gmail.readonly` added to the OAuth consent screen's scopes in Google Cloud Console:

1. Visit `/settings`, click **Connect Gmail**, complete consent.
2. After redirect, confirm in the DB: the user's `Account` row now has `scope` containing `gmail.readonly` and a non-null `refresh_token`, and a `GmailConnection` row exists.
   Run: `npx prisma studio` (or a quick script) and inspect `Account` + `GmailConnection`.
3. If `refresh_token` is null: re-check that `access_type=offline` and `prompt=consent` reached Google (the consent screen should have shown the Gmail permission). If the `GmailConnection` row is missing, apply the fallback noted in Task 8 Step 2.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings/page.tsx"
git commit -m "feat(settings): connect/disconnect Gmail card"
```

---

## Task 13: Sync orchestration task

**Files:**
- Create: `src/trigger/sync-gmail.ts`

Orchestration glue — verified by a real run, not unit-tested.

- [ ] **Step 1: Implement the scheduled task**

Create `src/trigger/sync-gmail.ts`:

```typescript
import { schedules } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { refreshAccessToken } from "@/lib/gmail/oauth";
import { getProfile, listHistory, getMessage } from "@/lib/gmail/client";
import { isJobRelevant } from "@/lib/gmail/relevance";
import { classifyEmail } from "@/lib/gmail/classify";
import { matchApplication, type AppCandidate } from "@/lib/gmail/match";
import { decideEmailAction } from "@/lib/gmail/decide";
import { applyDecision } from "@/lib/gmail/apply";

export const syncGmail = schedules.task({
  id: "sync-gmail",
  cron: "*/15 * * * *", // every 15 minutes
  run: async () => {
    const connections = await prisma.gmailConnection.findMany({ where: { syncEnabled: true } });
    let processed = 0;

    for (const conn of connections) {
      const token = await refreshAccessToken(conn.userId);
      if (!token) {
        console.warn(`[sync-gmail] no refresh token for user ${conn.userId} — skipping`);
        continue;
      }
      const accessToken = token.accessToken;

      // Seed the cursor on first run; never backfill historical mail.
      if (!conn.historyId) {
        const { historyId } = await getProfile(accessToken);
        await prisma.gmailConnection.update({
          where: { userId: conn.userId },
          data: { historyId, lastSyncedAt: new Date() },
        });
        continue;
      }

      let messageIds: string[];
      let latestHistoryId: string | null;
      try {
        const res = await listHistory(accessToken, conn.historyId);
        messageIds = res.messageIds;
        latestHistoryId = res.latestHistoryId;
      } catch (err: any) {
        if (err?.status === 404) {
          // Cursor too old — reseed and skip this run (avoids a full scan).
          const { historyId } = await getProfile(accessToken);
          await prisma.gmailConnection.update({ where: { userId: conn.userId }, data: { historyId } });
          continue;
        }
        console.warn(`[sync-gmail] history.list failed for ${conn.userId}`, err);
        continue;
      }

      // Candidate applications for matching (this user's tracked apps).
      const apps = await prisma.application.findMany({
        where: { userId: conn.userId },
        include: { job: { select: { company: true } } },
      });
      const candidates: AppCandidate[] = apps.map((a) => ({
        applicationId: a.id, company: a.job.company, status: a.status,
      }));

      for (const id of messageIds) {
        // Dedup: never reprocess a message we already logged.
        const seen = await prisma.emailInsight.findUnique({ where: { messageId: id }, select: { id: true } });
        if (seen) continue;

        let msg;
        try {
          msg = await getMessage(accessToken, id);
        } catch (err) {
          console.warn(`[sync-gmail] messages.get failed for ${id}`, err);
          continue;
        }

        // Privacy gate BEFORE any model call.
        if (!isJobRelevant({ fromEmail: msg.from, subject: msg.subject })) continue;

        const classification = await classifyEmail({ from: msg.from, subject: msg.subject, body: msg.body });
        const match = matchApplication({ fromEmail: msg.from, company: classification.company }, candidates);
        const decision = decideEmailAction(classification, match);

        const wrote = await applyDecision(conn.userId, {
          messageId: msg.id,
          threadId: msg.threadId,
          fromEmail: msg.from,
          subject: msg.subject,
          snippet: msg.snippet,
          confidence: classification.confidence,
        }, decision);
        if (wrote) processed++;

        // Reflect an auto-apply immediately so a later email in the same run sees it.
        if (decision.action === "auto_apply") {
          const c = candidates.find((x) => x.applicationId === decision.applicationId);
          if (c) c.status = decision.toStatus;
        }
      }

      await prisma.gmailConnection.update({
        where: { userId: conn.userId },
        data: { historyId: latestHistoryId ?? conn.historyId, lastSyncedAt: new Date() },
      });
    }

    return { connections: connections.length, processed };
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification (real run)**

Prereq: Task 12 connect flow done for your account; dev server on port 3050; `npx trigger.dev@latest dev` running (matches how `poll-jobs` is exercised).

1. Trigger the task once (Trigger.dev dashboard "Test", or wait for the cron). First run only seeds `historyId` and returns — confirm `GmailConnection.historyId` is now set.
2. Send yourself (or have on hand) a job-style email matching a tracked Application's company with an obvious rejection ("Unfortunately, we won't be moving forward"). Trigger the task again.
3. Confirm: an `EmailInsight` row exists (`outcome` = `auto_applied` if confidence ≥ 0.8), the `Application.status` changed, and an `email_detected` `ApplicationEvent` was written.
4. Load `/dashboard` — the change appears in the **Updates** feed. A lower-confidence or unmatched case appears in **Suggested updates**; click Confirm and verify the status changes and the suggestion disappears.

- [ ] **Step 4: Commit**

```bash
git add src/trigger/sync-gmail.ts
git commit -m "feat(gmail): scheduled History-API sync task"
```

---

## Task 14: Full verification + push

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (new gmail tests + existing suite).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Push**

```bash
git push origin main
```

---

## Self-Review Notes (addressed)

- **Spec coverage:** OAuth incremental + token persistence (Task 8), refresh (Task 8), thin fetch client / no `googleapis` (Task 9), `email_detected` enum + summary (Tasks 1–2), `GmailConnection`/`EmailInsight` (Task 1), relevance privacy gate (Task 3), Gemini classify (Task 4), matcher (Task 5), hybrid confidence decision (Task 6), persistence + event write (Task 7), History-API polling task with reseed + dedup + forward-only (Task 13), suggestions surface on dashboard (Tasks 10–11), settings connect/disconnect with revoke (Tasks 8, 12), testing plan (per-task), privacy (gate + snippet-only storage in Task 7) — all mapped.
- **Out of scope** (Pub/Sub, backfill, multi-account, dedicated inbox page) intentionally omitted.
- **Type consistency:** `Classification`/`EmailStatus` (classify.ts) consumed by decide.ts; `MatchResult`/`AppCandidate` (match.ts) consumed by decide.ts + sync task; `Decision` (decide.ts) consumed by apply.ts; `PendingSuggestion` (suggestions.ts) consumed by the card + summary. `email_detected` event always passes an explicit/derived summary.
