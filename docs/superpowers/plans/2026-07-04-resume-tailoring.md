# Resume Tailoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user paste (or pull from a tracked application) a job description and get AI-generated résumé tailoring — fit score, tailored summary, keyword gaps, tailored bullet rewrites, and skills to feature — saved and revisitable.

**Architecture:** Works from the stored résumé plain text (`Resume.text`) + a job description; never touches LaTeX. A synchronous, rate-limited route (`POST /api/resume/tailor`) builds a prompt, calls the existing `analyze<T>()` Gemini helper, Zod-validates, and persists a `Tailoring` row. Mirrors the existing resume-analysis prompt/schema pattern. UI is a `/tailor` page plus a prefill entry point from the tracker.

**Tech Stack:** Next.js 16 (App Router, Route Handlers, RSC), React 19, Prisma 7 + Neon Postgres, Zod, `@google/genai` via `lib/ai/provider`, Vitest + Testing Library.

## Global Constraints

- NON-standard Next.js 16 build — consult `node_modules/next/dist/docs/` before App Router code (per `AGENTS.md`).
- Work directly on `main` (user preference — no feature branch). Commit per task. Git identity is configured locally in this repo.
- No LaTeX generation/editing — output is content the user pastes into their own source.
- Migration is **additive** (new table + nullable FK) — do NOT reset the database.
- AI calls go through `analyze<T>({ system, prompt }, { client? })` (`src/lib/ai/provider.ts`); the client is injectable for tests.
- AI routes: `requireUser()`, block demo users via `isDemoEmail(user.email)` → 403, rate-limit with `rateLimit(\`ai:${user.id}\`, 20, 60_000)` → 429 with `Retry-After`. (Follow `src/app/api/site/route.ts` exactly.)
- Prompt-builder + Zod-schema pattern mirrors `src/lib/resume/prompt.ts`.
- Definition of green: `npx tsc --noEmit`, `npm test`, `next build` all pass. One pre-existing unrelated failure — `src/app/api/resume/upload/route.test.ts` (undici/File test-env issue) — is expected to stay red and is NOT introduced here.
- tsc file-extraction note: paths contain `(app)` — use `grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\): error.*//' | sort -u`.

## File Structure

- `prisma/schema.prisma` — `Tailoring` model + relations on `User`/`Resume`/`Application`.
- `src/lib/resume/tailor-prompt.ts` — `TailoringResult`, `TailoringResultSchema`, `buildTailorPrompt`.
- `src/lib/resume/tailor.ts` — `generateTailoring()` + `NoResumeError` (loads résumé, builds prompt, analyze, parse, persist).
- `src/lib/resume/tailorings.ts` — read helpers: `getTailorings`, `getTailoredApplicationIds`, `getTailoring`.
- `src/app/api/resume/tailor/route.ts` — `POST` handler.
- `src/components/tailor/copy-button.tsx` — copy-to-clipboard button.
- `src/components/tailor/tailoring-result.tsx` — result view.
- `src/components/tailor/tailor-client.tsx` — form + fetch + state.
- `src/app/(app)/tailor/page.tsx` — server shell (résumés, history, prefill).
- `src/components/app-nav.tsx` — "Tailor" nav item.
- `src/components/application-detail-panel.tsx` — "Tailor résumé" link + "tailored ✓" marker.
- `src/components/spreadsheet/application-spreadsheet.tsx` + `src/app/(app)/applications/page.tsx` — thread the tailored-ids set to the detail panel.

---

### Task 1: Schema — `Tailoring` model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: generated migration under `prisma/migrations/`

**Interfaces:**
- Produces: `Tailoring` model with `id, userId, resumeId, applicationId?, company?, jobTitle?, jobDescription, fitScore, result(Json), createdAt`; relations `User.tailorings`, `Resume.tailorings`, `Application.tailorings`.

- [ ] **Step 1: Add the model + relations**

In `prisma/schema.prisma`, add the model:

```prisma
model Tailoring {
  id             String       @id @default(cuid())
  userId         String
  resumeId       String
  applicationId  String?
  company        String?
  jobTitle       String?
  jobDescription String
  fitScore       Int
  result         Json
  createdAt      DateTime     @default(now())
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  resume         Resume       @relation(fields: [resumeId], references: [id], onDelete: Cascade)
  application    Application? @relation(fields: [applicationId], references: [id], onDelete: SetNull)
}
```

Add the back-relations: in `model User` add `tailorings Tailoring[]`; in `model Resume` add `tailorings Tailoring[]`; in `model Application` add `tailorings Tailoring[]`.

- [ ] **Step 2: Validate**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Create + apply the additive migration**

Run: `npx prisma migrate dev --name add_tailoring`
Expected: applies cleanly (new table + nullable FK, no data loss, no reset). Client regenerates.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(schema): add Tailoring model"
```

---

### Task 2: Tailoring prompt + schema

**Files:**
- Create: `src/lib/resume/tailor-prompt.ts`
- Test: `src/lib/resume/tailor-prompt.test.ts`

**Interfaces:**
- Produces:
  - `const TailoringResultSchema` (Zod), `type TailoringResult = z.infer<typeof TailoringResultSchema>` with fields `fitScore:number, summary:string, keywordGaps:string[], tailoredBullets:{original:string,tailored:string}[], skillsToFeature:string[], strengths:string[], gaps:string[]`
  - `function buildTailorPrompt(resumeText: string, jobDescription: string): { system: string; prompt: string }`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resume/tailor-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TailoringResultSchema, buildTailorPrompt } from "./tailor-prompt";

const valid = {
  fitScore: 78, summary: "Backend engineer…",
  keywordGaps: ["Kubernetes"], tailoredBullets: [{ original: "Built API", tailored: "Designed gRPC service" }],
  skillsToFeature: ["Go"], strengths: ["backend depth"], gaps: ["no k8s"],
};

describe("TailoringResultSchema", () => {
  it("accepts a well-formed result", () => {
    expect(TailoringResultSchema.parse(valid)).toEqual(valid);
  });
  it("rejects a missing fitScore", () => {
    const { fitScore, ...rest } = valid;
    expect(() => TailoringResultSchema.parse(rest)).toThrow();
  });
  it("rejects a fitScore out of 0–100", () => {
    expect(() => TailoringResultSchema.parse({ ...valid, fitScore: 140 })).toThrow();
  });
  it("rejects a tailoredBullet missing 'tailored'", () => {
    expect(() => TailoringResultSchema.parse({ ...valid, tailoredBullets: [{ original: "x" }] })).toThrow();
  });
});

describe("buildTailorPrompt", () => {
  it("includes the résumé text and the job description", () => {
    const { system, prompt } = buildTailorPrompt("RESUME_TEXT_HERE", "JD_TEXT_HERE");
    expect(prompt).toContain("RESUME_TEXT_HERE");
    expect(prompt).toContain("JD_TEXT_HERE");
    expect(system.toLowerCase()).toContain("json");
    // Must instruct the model not to fabricate experience.
    expect(system.toLowerCase()).toContain("gaps");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/resume/tailor-prompt.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `tailor-prompt.ts`**

```ts
import { z } from "zod";

export const TailoringResultSchema = z.object({
  fitScore: z.number().min(0).max(100),
  summary: z.string(),
  keywordGaps: z.array(z.string()),
  tailoredBullets: z.array(z.object({ original: z.string(), tailored: z.string() })),
  skillsToFeature: z.array(z.string()),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
});
export type TailoringResult = z.infer<typeof TailoringResultSchema>;

export function buildTailorPrompt(resumeText: string, jobDescription: string) {
  const system = [
    "You are an expert technical resume tailor and ATS specialist.",
    "Given a candidate's resume and a specific job description, tailor the resume to that job.",
    "Be specific, truthful, and ATS-aware. NEVER invent experience the resume does not contain —",
    'if the job needs something the resume lacks, put it in "gaps", never in "tailoredBullets".',
    "Return ONLY JSON matching this shape:",
    '{ "fitScore": number 0-100, "summary": string,',
    '  "keywordGaps": string[], "tailoredBullets": [ { "original": string, "tailored": string } ],',
    '  "skillsToFeature": string[], "strengths": string[], "gaps": string[] }',
    "fitScore = how well THIS resume matches THIS job.",
    "summary = a tailored professional-summary paragraph aimed at this role.",
    "tailoredBullets = rewrites of the resume's REAL bullets, emphasizing what this job values.",
    "keywordGaps = important job terms missing or weak in the resume.",
    "skillsToFeature = which of the candidate's skills to surface/reorder for this role.",
  ].join("\n");
  const prompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;
  return { system, prompt };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/resume/tailor-prompt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/tailor-prompt.ts src/lib/resume/tailor-prompt.test.ts
git commit -m "feat(tailoring): prompt builder + result schema"
```

---

### Task 3: `generateTailoring` service

**Files:**
- Create: `src/lib/resume/tailor.ts`
- Test: `src/lib/resume/tailor.test.ts`

**Interfaces:**
- Consumes: `analyze`/`ModelLike` (`@/lib/ai/provider`), `buildTailorPrompt`/`TailoringResultSchema`/`TailoringResult` (Task 2), `prisma`.
- Produces:
  - `class NoResumeError extends Error`
  - `interface GenerateTailoringInput { userId: string; jobDescription: string; applicationId?: string }`
  - `function generateTailoring(input, opts?: { client?: ModelLike }): Promise<{ id: string } & TailoringResult>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resume/tailor.test.ts` (mock prisma + inject a fake AI client via `opts.client`):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const resumeFindFirst = vi.fn();
const appFindFirst = vi.fn();
const tailoringCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    resume: { findFirst: (...a: any) => resumeFindFirst(...a) },
    application: { findFirst: (...a: any) => appFindFirst(...a) },
    tailoring: { create: (...a: any) => tailoringCreate(...a) },
  },
}));

import { generateTailoring, NoResumeError } from "./tailor";

const validModelJson = JSON.stringify({
  fitScore: 80, summary: "s", keywordGaps: ["k8s"],
  tailoredBullets: [{ original: "a", tailored: "b" }],
  skillsToFeature: ["Go"], strengths: ["x"], gaps: ["y"],
});
const fakeClient = { generateContent: vi.fn().mockResolvedValue({ text: validModelJson }) };

beforeEach(() => { vi.clearAllMocks(); fakeClient.generateContent.mockResolvedValue({ text: validModelJson }); });

it("throws NoResumeError when the user has no résumé", async () => {
  resumeFindFirst.mockResolvedValue(null);
  await expect(generateTailoring({ userId: "u1", jobDescription: "jd" }, { client: fakeClient }))
    .rejects.toBeInstanceOf(NoResumeError);
  expect(tailoringCreate).not.toHaveBeenCalled();
});

it("builds from the latest résumé, persists the tailoring, and returns the parsed result", async () => {
  resumeFindFirst.mockResolvedValue({ id: "r1", text: "RESUME" });
  tailoringCreate.mockResolvedValue({ id: "t1" });
  const out = await generateTailoring({ userId: "u1", jobDescription: "JD" }, { client: fakeClient });
  // résumé loaded scoped to user, newest first
  expect(resumeFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: "u1" }, orderBy: { createdAt: "desc" },
  }));
  // prompt reached the model with résumé + JD
  const sent = fakeClient.generateContent.mock.calls[0][0].contents as string;
  expect(sent).toContain("RESUME");
  expect(sent).toContain("JD");
  // persisted with snapshot + score
  expect(tailoringCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ userId: "u1", resumeId: "r1", jobDescription: "JD", fitScore: 80 }),
  }));
  expect(out).toEqual(expect.objectContaining({ id: "t1", fitScore: 80, summary: "s" }));
});

it("snapshots company/title/appId when a valid applicationId is given", async () => {
  resumeFindFirst.mockResolvedValue({ id: "r1", text: "R" });
  appFindFirst.mockResolvedValue({ id: "a1", company: "Stripe", title: "SWE" });
  tailoringCreate.mockResolvedValue({ id: "t1" });
  await generateTailoring({ userId: "u1", jobDescription: "JD", applicationId: "a1" }, { client: fakeClient });
  expect(tailoringCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ applicationId: "a1", company: "Stripe", jobTitle: "SWE" }),
  }));
});

it("throws (and saves nothing) when the model returns malformed JSON", async () => {
  resumeFindFirst.mockResolvedValue({ id: "r1", text: "R" });
  fakeClient.generateContent.mockResolvedValue({ text: JSON.stringify({ fitScore: 999 }) });
  await expect(generateTailoring({ userId: "u1", jobDescription: "JD" }, { client: fakeClient })).rejects.toThrow();
  expect(tailoringCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/resume/tailor.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `tailor.ts`**

```ts
import { prisma } from "@/lib/db";
import { analyze, type ModelLike } from "@/lib/ai/provider";
import { buildTailorPrompt, TailoringResultSchema, type TailoringResult } from "./tailor-prompt";

export class NoResumeError extends Error {
  constructor() {
    super("No résumé found. Upload a résumé first.");
    this.name = "NoResumeError";
  }
}

export interface GenerateTailoringInput {
  userId: string;
  jobDescription: string;
  applicationId?: string;
}

export async function generateTailoring(
  input: GenerateTailoringInput,
  opts: { client?: ModelLike } = {}
): Promise<{ id: string } & TailoringResult> {
  const resume = await prisma.resume.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, text: true },
  });
  if (!resume) throw new NoResumeError();

  let applicationId: string | null = null;
  let company: string | null = null;
  let jobTitle: string | null = null;
  if (input.applicationId) {
    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, userId: input.userId },
      select: { id: true, company: true, title: true },
    });
    if (app) { applicationId = app.id; company = app.company; jobTitle = app.title; }
  }

  const { system, prompt } = buildTailorPrompt(resume.text, input.jobDescription);
  const raw = await analyze<unknown>({ system, prompt }, opts);
  const result = TailoringResultSchema.parse(raw);

  const row = await prisma.tailoring.create({
    data: {
      userId: input.userId,
      resumeId: resume.id,
      applicationId,
      company,
      jobTitle,
      jobDescription: input.jobDescription,
      fitScore: result.fitScore,
      result: result as object,
    },
    select: { id: true },
  });

  return { id: row.id, ...result };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/resume/tailor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/tailor.ts src/lib/resume/tailor.test.ts
git commit -m "feat(tailoring): generateTailoring service"
```

---

### Task 4: Tailoring read helpers

**Files:**
- Create: `src/lib/resume/tailorings.ts`
- Test: `src/lib/resume/tailorings.test.ts`

**Interfaces:**
- Produces:
  - `interface TailoringListItem { id: string; company: string | null; jobTitle: string | null; fitScore: number; createdAt: Date; applicationId: string | null }`
  - `getTailorings(userId: string): Promise<TailoringListItem[]>`
  - `getTailoredApplicationIds(userId: string): Promise<Set<string>>`
  - `getTailoring(userId: string, id: string): Promise<({ id: string; jobDescription: string; company: string|null; jobTitle: string|null } & TailoringResult) | null>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/resume/tailorings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: { tailoring: { findMany: (...a: any) => findMany(...a), findFirst: (...a: any) => findFirst(...a) } },
}));

import { getTailorings, getTailoredApplicationIds, getTailoring } from "./tailorings";

beforeEach(() => vi.clearAllMocks());

it("getTailorings queries newest-first scoped to the user", async () => {
  findMany.mockResolvedValue([{ id: "t1", company: "Stripe", jobTitle: "SWE", fitScore: 80, createdAt: new Date(0), applicationId: "a1" }]);
  const out = await getTailorings("u1");
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" }, orderBy: { createdAt: "desc" } }));
  expect(out[0].id).toBe("t1");
});

it("getTailoredApplicationIds returns a Set of non-null application ids", async () => {
  findMany.mockResolvedValue([{ applicationId: "a1" }, { applicationId: "a2" }]);
  const set = await getTailoredApplicationIds("u1");
  expect(set.has("a1")).toBe(true);
  expect(set.has("a2")).toBe(true);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", applicationId: { not: null } } }));
});

it("getTailoring flattens the stored result JSON, or null when not found", async () => {
  findFirst.mockResolvedValue(null);
  expect(await getTailoring("u1", "nope")).toBeNull();
  findFirst.mockResolvedValue({
    id: "t1", jobDescription: "JD", company: "Stripe", jobTitle: "SWE",
    result: { fitScore: 80, summary: "s", keywordGaps: [], tailoredBullets: [], skillsToFeature: [], strengths: [], gaps: [] },
  });
  const out = await getTailoring("u1", "t1");
  expect(out).toEqual(expect.objectContaining({ id: "t1", jobDescription: "JD", fitScore: 80, summary: "s" }));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/resume/tailorings.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `tailorings.ts`**

```ts
import { prisma } from "@/lib/db";
import type { TailoringResult } from "./tailor-prompt";

export interface TailoringListItem {
  id: string;
  company: string | null;
  jobTitle: string | null;
  fitScore: number;
  createdAt: Date;
  applicationId: string | null;
}

export async function getTailorings(userId: string): Promise<TailoringListItem[]> {
  return prisma.tailoring.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, company: true, jobTitle: true, fitScore: true, createdAt: true, applicationId: true },
  });
}

export async function getTailoredApplicationIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.tailoring.findMany({
    where: { userId, applicationId: { not: null } },
    select: { applicationId: true },
    distinct: ["applicationId"],
  });
  return new Set(rows.map((r) => r.applicationId).filter((x): x is string => x !== null));
}

export async function getTailoring(
  userId: string,
  id: string
): Promise<({ id: string; jobDescription: string; company: string | null; jobTitle: string | null } & TailoringResult) | null> {
  const row = await prisma.tailoring.findFirst({ where: { id, userId } });
  if (!row) return null;
  return {
    id: row.id,
    jobDescription: row.jobDescription,
    company: row.company,
    jobTitle: row.jobTitle,
    ...(row.result as TailoringResult),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/resume/tailorings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/resume/tailorings.ts src/lib/resume/tailorings.test.ts
git commit -m "feat(tailoring): read helpers (history, tailored-app ids, one)"
```

---

### Task 5: `POST /api/resume/tailor` route

**Files:**
- Create: `src/app/api/resume/tailor/route.ts`
- Test: `src/app/api/resume/tailor/route.test.ts`

**Interfaces:**
- Consumes: `generateTailoring`/`NoResumeError` (Task 3), `requireUser`, `rateLimit`, `isDemoEmail`.

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/resume/tailor/route.test.ts` (mirror the mock style of `src/app/api/site/route.test.ts` — read it first):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUser = vi.fn();
const rateLimit = vi.fn();
const generateTailoring = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...a: any) => requireUser(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: any) => rateLimit(...a) }));
vi.mock("@/lib/demo/config", () => ({ isDemoEmail: (e: string) => e === "demo@hone.app" }));
vi.mock("@/lib/resume/tailor", async () => {
  class NoResumeError extends Error {}
  return { generateTailoring: (...a: any) => generateTailoring(...a), NoResumeError };
});

import { POST } from "./route";
import { NoResumeError } from "@/lib/resume/tailor";

const req = (body: unknown) => new Request("http://x/api/resume/tailor", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1", email: "real@x.com" });
  rateLimit.mockReturnValue({ ok: true, retryAfter: 0 });
});

it("403 for demo users", async () => {
  requireUser.mockResolvedValue({ id: "u1", email: "demo@hone.app" });
  const res = await POST(req({ jobDescription: "jd" }));
  expect(res.status).toBe(403);
});

it("429 when rate-limited", async () => {
  rateLimit.mockReturnValue({ ok: false, retryAfter: 30 });
  const res = await POST(req({ jobDescription: "jd" }));
  expect(res.status).toBe(429);
  expect(res.headers.get("Retry-After")).toBe("30");
});

it("400 on empty job description", async () => {
  const res = await POST(req({ jobDescription: "  " }));
  expect(res.status).toBe(400);
});

it("400 with code no_resume when the user has no résumé", async () => {
  generateTailoring.mockRejectedValue(new NoResumeError());
  const res = await POST(req({ jobDescription: "jd" }));
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe("no_resume");
});

it("returns the tailoring result on success", async () => {
  generateTailoring.mockResolvedValue({ id: "t1", fitScore: 80, summary: "s", keywordGaps: [], tailoredBullets: [], skillsToFeature: [], strengths: [], gaps: [] });
  const res = await POST(req({ jobDescription: "jd", applicationId: "a1" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(expect.objectContaining({ id: "t1", fitScore: 80 }));
  expect(generateTailoring).toHaveBeenCalledWith({ userId: "u1", jobDescription: "jd", applicationId: "a1" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/app/api/resume/tailor/route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `route.ts`**

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoEmail } from "@/lib/demo/config";
import { generateTailoring, NoResumeError } from "@/lib/resume/tailor";

const Body = z.object({
  jobDescription: z.string().trim().min(1),
  applicationId: z.string().optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  if (isDemoEmail(user.email)) {
    return NextResponse.json({ error: "This feature is disabled in the demo." }, { status: 403 });
  }
  const rl = rateLimit(`ai:${user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const p = Body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "A job description is required." }, { status: 400 });

  try {
    const result = await generateTailoring({
      userId: user.id,
      jobDescription: p.data.jobDescription,
      applicationId: p.data.applicationId,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoResumeError) {
      return NextResponse.json({ error: e.message, code: "no_resume" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not generate tailoring. Please try again." }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/app/api/resume/tailor/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/resume/tailor/route.ts src/app/api/resume/tailor/route.test.ts
git commit -m "feat(tailoring): POST /api/resume/tailor route"
```

---

### Task 6: Copy button + result view

**Files:**
- Create: `src/components/tailor/copy-button.tsx`
- Create: `src/components/tailor/tailoring-result.tsx`
- Test: `src/components/tailor/tailoring-result.test.tsx`

**Interfaces:**
- Consumes: `TailoringResult` (Task 2), `Button` (`@/components/ui/button`), `cn`.
- Produces:
  - `CopyButton({ text, label? }: { text: string; label?: string })`
  - `TailoringResultView({ result }: { result: TailoringResult })`

- [ ] **Step 1: Write the failing test**

Create `src/components/tailor/tailoring-result.test.tsx`:

```tsx
import { it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TailoringResultView } from "./tailoring-result";

const result = {
  fitScore: 78, summary: "Tailored summary here.",
  keywordGaps: ["Kubernetes", "gRPC"],
  tailoredBullets: [{ original: "Built API", tailored: "Designed a gRPC service" }],
  skillsToFeature: ["Go", "Postgres"], strengths: ["backend depth"], gaps: ["no k8s"],
};

it("renders every section of the result", () => {
  render(<TailoringResultView result={result} />);
  expect(screen.getByText("78")).toBeInTheDocument();           // fit score
  expect(screen.getByText("Tailored summary here.")).toBeInTheDocument();
  expect(screen.getByText("Kubernetes")).toBeInTheDocument();   // keyword gap
  expect(screen.getByText("Designed a gRPC service")).toBeInTheDocument(); // tailored bullet
  expect(screen.getByText("Go")).toBeInTheDocument();           // skill
  expect(screen.getByText("backend depth")).toBeInTheDocument();// strength
  expect(screen.getByText("no k8s")).toBeInTheDocument();       // gap
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/tailor/tailoring-result.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `copy-button.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch { /* clipboard unavailable — no-op */ }
      }}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted",
        done && "text-primary"
      )}
      aria-label={label}
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      {done ? "Copied" : label}
    </button>
  );
}
```

- [ ] **Step 4: Implement `tailoring-result.tsx`**

```tsx
import type { TailoringResult } from "@/lib/resume/tailor-prompt";
import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{s}</span>
      ))}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TailoringResultView({ result }: { result: TailoringResult }) {
  const scoreColor =
    result.fitScore >= 75 ? "text-[#268a3a]" : result.fitScore >= 50 ? "text-[#9a7212]" : "text-destructive";
  return (
    <div className="flex flex-col gap-4">
      <Section title="Fit for this job">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-4xl font-extrabold", scoreColor)}>{result.fitScore}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
      </Section>

      <Section title="Tailored summary" action={<CopyButton text={result.summary} />}>
        <p className="whitespace-pre-wrap text-sm">{result.summary}</p>
      </Section>

      <Section title="Keyword gaps"><Chips items={result.keywordGaps} /></Section>

      <Section title="Tailored bullets">
        {result.tailoredBullets.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.tailoredBullets.map((b, i) => (
              <li key={i} className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground line-through">{b.original}</p>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{b.tailored}</p>
                  <CopyButton text={b.tailored} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Skills to feature"><Chips items={result.skillsToFeature} /></Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Strengths">
          <ul className="list-disc pl-5 text-sm">{result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </Section>
        <Section title="Gaps">
          <ul className="list-disc pl-5 text-sm">{result.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </Section>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/components/tailor/tailoring-result.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/tailor/copy-button.tsx src/components/tailor/tailoring-result.tsx src/components/tailor/tailoring-result.test.tsx
git commit -m "feat(tailoring): result view + copy button"
```

---

### Task 7: Tailor client (form + fetch + states)

**Files:**
- Create: `src/components/tailor/tailor-client.tsx`
- Test: `src/components/tailor/tailor-client.test.tsx`

**Interfaces:**
- Consumes: `TailoringResultView` (Task 6), `TailoringResult` (Task 2), `Button`, `Textarea`.
- Produces:
  ```ts
  interface TailorClientProps {
    hasResume: boolean;
    initialJobDescription?: string;
    applicationId?: string;
  }
  export function TailorClient(props: TailorClientProps): JSX.Element
  ```

**Behavior:** textarea seeded with `initialJobDescription`; on submit, POST `/api/resume/tailor` with `{ jobDescription, applicationId }`; show a loading state; on success render `<TailoringResultView>`; map errors — 400 `no_resume` → "upload a résumé first" with a link to `/profile`, 429 → "Too many requests, try again in Ns", other → generic. If `hasResume` is false, show the upload prompt instead of the form.

- [ ] **Step 1: Write the failing test**

Create `src/components/tailor/tailor-client.test.tsx`:

```tsx
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TailorClient } from "./tailor-client";

const okResult = { id: "t1", fitScore: 82, summary: "Tailored.", keywordGaps: [], tailoredBullets: [], skillsToFeature: [], strengths: [], gaps: [] };

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

it("submits the JD and renders the result", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okResult }));
  render(<TailorClient hasResume initialJobDescription="Some JD" />);
  fireEvent.click(screen.getByRole("button", { name: /tailor/i }));
  await waitFor(() => expect(screen.getByText("82")).toBeInTheDocument());
  const body = JSON.parse((fetch as any).mock.calls[0][1].body);
  expect(body.jobDescription).toBe("Some JD");
});

it("shows an upload prompt when there is no résumé", () => {
  render(<TailorClient hasResume={false} />);
  expect(screen.getByText(/upload a résumé/i)).toBeInTheDocument();
});

it("surfaces a rate-limit error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, headers: { get: () => "30" }, json: async () => ({ error: "Too many requests" }) }));
  render(<TailorClient hasResume initialJobDescription="JD" />);
  fireEvent.click(screen.getByRole("button", { name: /tailor/i }));
  await waitFor(() => expect(screen.getByText(/too many requests/i)).toBeInTheDocument());
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/tailor/tailor-client.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `tailor-client.tsx`**

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TailoringResultView } from "./tailoring-result";
import type { TailoringResult } from "@/lib/resume/tailor-prompt";

interface TailorClientProps {
  hasResume: boolean;
  initialJobDescription?: string;
  applicationId?: string;
}

export function TailorClient({ hasResume, initialJobDescription = "", applicationId }: TailorClientProps) {
  const [jd, setJd] = useState(initialJobDescription);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailoringResult | null>(null);

  if (!hasResume) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm">
        <p className="font-semibold">Upload a résumé first</p>
        <p className="mt-1 text-muted-foreground">Tailoring works from your uploaded résumé. Add one to get started.</p>
        <Button className="mt-3" render={<Link href="/profile" />}>Go to Profile</Button>
      </div>
    );
  }

  async function submit() {
    if (!jd.trim()) { setError("Paste a job description first."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jd, applicationId }),
      });
      if (res.status === 429) {
        const retry = res.headers.get("Retry-After");
        setError(`Too many requests. Try again${retry ? ` in ${retry}s` : ""}.`);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data?.code === "no_resume" ? "Upload a résumé first (Profile)." : (data?.error ?? "Something went wrong."));
        return;
      }
      setResult(data as TailoringResult);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the job description…"
          className="min-h-40"
          aria-label="Job description"
        />
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={loading}>{loading ? "Tailoring…" : "Tailor résumé"}</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
      {result && <TailoringResultView result={result} />}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/components/tailor/tailor-client.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tailor/tailor-client.tsx src/components/tailor/tailor-client.test.tsx
git commit -m "feat(tailoring): tailor client form + states"
```

---

### Task 8: Tailor page + nav

**Files:**
- Create: `src/app/(app)/tailor/page.tsx`
- Modify: `src/components/app-nav.tsx`

**Interfaces:**
- Consumes: `TailorClient` (Task 7), `getTailorings` (Task 4), `requireUser`, `prisma`.

- [ ] **Step 1: Implement the page**

Create `src/app/(app)/tailor/page.tsx` (Server Component; reads résumé existence, optional prefill JD from `?applicationId`, and history):

```tsx
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTailorings } from "@/lib/resume/tailorings";
import { TailorClient } from "@/components/tailor/tailor-client";

export const dynamic = "force-dynamic";

export default async function TailorPage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string }>;
}) {
  const user = await requireUser();
  const { applicationId } = await searchParams;

  const [resume, app, history] = await Promise.all([
    prisma.resume.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    applicationId
      ? prisma.application.findFirst({ where: { id: applicationId, userId: user.id }, select: { description: true } })
      : Promise.resolve(null),
    getTailorings(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary">Résumé</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Tailor to a job</h1>
        <p className="text-muted-foreground mt-1">
          Paste a job description — get a fit score, tailored summary, keyword gaps, and rewritten bullets to drop into your résumé.
        </p>
      </div>

      <TailorClient
        hasResume={Boolean(resume)}
        initialJobDescription={app?.description ?? ""}
        applicationId={applicationId}
      />

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Past tailorings</h2>
          <ul className="flex flex-col gap-2">
            {history.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 text-sm">
                <span className="font-medium">{t.company ? `${t.company}${t.jobTitle ? ` · ${t.jobTitle}` : ""}` : "Pasted job description"}</span>
                <span className="text-muted-foreground">Fit {t.fitScore} · {new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

(History items are display-only in v1; reopening a saved result is a follow-up. Do NOT add a detail route now — YAGNI.)

- [ ] **Step 2: Add the nav item**

In `src/components/app-nav.tsx`, add `Sparkles` to the lucide import, and add to `navItems` after Applications:

```ts
  { href: "/tailor", label: "Tailor", icon: Sparkles },
```

- [ ] **Step 3: Verify + build the route**

Run: `npx tsc --noEmit 2>&1 | grep -E "tailor/page|app-nav"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/tailor/page.tsx" src/components/app-nav.tsx
git commit -m "feat(tailoring): /tailor page + nav item"
```

---

### Task 9: Tracker entry point + "tailored ✓" marker

**Files:**
- Modify: `src/components/application-detail-panel.tsx`
- Modify: `src/components/spreadsheet/application-spreadsheet.tsx`
- Modify: `src/app/(app)/applications/page.tsx`

**Interfaces:**
- Consumes: `getTailoredApplicationIds` (Task 4).
- `ApplicationSpreadsheet` gains an optional prop `tailoredIds?: Set<string>`; `ApplicationDetailPanel` gains an optional prop `tailored?: boolean`.

- [ ] **Step 1: Add a "Tailor résumé" link + tailored badge to the detail panel**

In `src/components/application-detail-panel.tsx`:
- Add imports: `import Link from "next/link";` and `import { Sparkles, Check } from "lucide-react";` (merge with existing lucide import if present).
- Widen the component props to accept `tailored?: boolean` (add to the props interface/destructure).
- Near the header action area (by the existing URL link / around line 130), add a link button:

```tsx
<Button
  variant="secondary"
  render={<Link href={`/tailor?applicationId=${app.id}`} />}
>
  <Sparkles className="size-4" /> Tailor résumé
</Button>
```

- Next to the title, when `tailored` is true, render a small badge:

```tsx
{tailored && (
  <span className="inline-flex items-center gap-1 rounded-full bg-[#def6e0] px-2 py-0.5 text-xs font-medium text-[#268a3a]">
    <Check className="size-3" /> Tailored
  </span>
)}
```

- [ ] **Step 2: Thread the prop through the spreadsheet**

In `src/components/spreadsheet/application-spreadsheet.tsx`:
- Add `tailoredIds` to the props: `{ applications, prefs, tailoredIds }: { applications: ApplicationRow[]; prefs: TablePrefs | null; tailoredIds?: Set<string> }`.
- Where it renders `<ApplicationDetailPanel app={detail} open={detailOpen} onOpenChange={setDetailOpen} />`, add `tailored={detail ? (tailoredIds?.has(detail.id) ?? false) : false}`.

- [ ] **Step 3: Fetch + pass the set from the page**

In `src/app/(app)/applications/page.tsx`:
- Import `getTailoredApplicationIds` from `@/lib/resume/tailorings`.
- Add it to the existing `Promise.all` (alongside the apps + prefs fetch): `getTailoredApplicationIds(user.id)`.
- Pass `tailoredIds={tailoredIds}` to `<ApplicationSpreadsheet …>`.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "application-detail-panel|application-spreadsheet|applications/page"`
Expected: no output.
Run: `npx vitest run src/components/spreadsheet/application-spreadsheet.test.tsx`
Expected: PASS (existing tests unaffected — the new prop is optional).

- [ ] **Step 5: Commit**

```bash
git add src/components/application-detail-panel.tsx src/components/spreadsheet/application-spreadsheet.tsx "src/app/(app)/applications/page.tsx"
git commit -m "feat(tailoring): tracker entry point + tailored marker"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep "error TS" | sed -E 's/\([0-9]+,[0-9]+\): error.*//' | sort -u`
Expected: no output (0 errors).

- [ ] **Step 2: Unit tests**

Run: `npm test`
Expected: all pass EXCEPT the known pre-existing `src/app/api/resume/upload/route.test.ts` failure. Report the count.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds; a `/tailor` route and an `/api/resume/tailor` route appear in the route table.

- [ ] **Step 4: Commit (if any incidental fixes were needed)**

```bash
git add -A
git commit -m "chore(tailoring): verification fixups" || echo "nothing to commit"
```

---

## Self-Review Notes (author)

- **Spec coverage:** §1 data model → Task 1; §2 AI piece → Task 2; §3 flow/route (thin route + testable `generateTailoring`) → Tasks 3, 5; §4 UI (page, result, prefill, history, nav, tracker entry, marker) → Tasks 6, 7, 8, 9; §5 testing → folded per task + Task 10 gate. Read helpers (`tailorings.ts`) → Task 4.
- **Type consistency:** `TailoringResult`/`TailoringResultSchema`/`buildTailorPrompt` (Task 2) consumed by Tasks 3, 4, 6, 7. `generateTailoring`/`NoResumeError` (Task 3) consumed by Task 5. `getTailorings`/`getTailoredApplicationIds` (Task 4) consumed by Tasks 8, 9. `TailorClient` props (Task 7) consumed by Task 8. `tailoredIds`/`tailored` props (Task 9) threaded page → spreadsheet → panel.
- **Demo + key notes:** the route blocks demo users (403) and needs `GOOGLE_GENERATIVE_AI_API_KEY` for real generation — absent it, the route returns 502 and the UI shows the generic error (graceful degradation). Both are expected, not bugs.
- **Open note for implementer (Task 9):** confirm the exact prop-interface shape of `ApplicationDetailPanel` before adding `tailored?` (read the file); keep the new prop optional so the existing spreadsheet tests pass unchanged.
