# Resume-per-job tailoring

**Date:** 2026-07-04
**Status:** Approved (design)
**Sub-project 3 of 4** in the Hone pivot. Sequence: (1) remove job search ✅ → (2) spreadsheet tracker ✅ → (3) **resume tailoring** → (4) Chrome extension.

## Why

Users tailor their resume to each job to pass ATS keyword screens and read as a strong fit. Hone already stores the user's resume as extracted plain text (`Resume.text`, from the PDF/DOCX upload pipeline) and, since sub-project #1, stores a job posting on every application (`Application.description`). This feature pairs those two: paste (or pull) a job description, and get AI-generated tailoring content the user applies to their own résumé source (Overleaf/LaTeX) themselves.

Crucially, Hone does **not** hold the user's `.tex` source — only the extracted text of the compiled PDF. So the feature works from that text and outputs **content suggestions**, never editing LaTeX (which an LLM can silently break). This is the robust, content-first approach chosen during brainstorming.

## Goals

- A standalone **`/tailor`** page: paste a job description → generate tailoring against the user's latest résumé.
- Outputs: **fit score (0–100) + rationale**, a **tailored summary**, **keyword gaps**, **tailored bullet rewrites** (original → tailored), and **skills to feature** — each easy to copy into Overleaf.
- **Prefill from a tracked application**: a "Tailor résumé to this job" action that opens `/tailor` with the app's stored `description`; a "tailored ✓" marker on apps that have one.
- **Persist** each tailoring (résumé + JD snapshot + result), so it's revisitable and linkable to the application.
- Reuse the existing `analyze<T>()` Gemini helper and the prompt-builder + Zod-schema pattern already used by resume analysis.

## Non-goals

- Editing or generating LaTeX. Output is content the user pastes into their own source.
- Storing the user's `.tex` source.
- A background/async pipeline. Tailoring is a foreground, user-initiated action (synchronous).
- Auto-applying tailoring to the résumé or auto-updating the stored résumé text.
- Multi-résumé management UX beyond picking among résumés the user already has.

## Design

### 1. Data model

New `Tailoring` model (no `status` — synchronous; a row exists only on success):

```prisma
model Tailoring {
  id             String   @id @default(cuid())
  userId         String
  resumeId       String
  applicationId  String?  // set when launched from a tracked application
  company        String?  // convenience label (from the application, if any)
  jobTitle       String?  // convenience label (from the application, if any)
  jobDescription String   // JD snapshot the tailoring was generated against
  fitScore       Int
  result         Json     // TailoringResult (below)
  createdAt      DateTime @default(now())
  user           User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  resume         Resume      @relation(fields: [resumeId], references: [id], onDelete: Cascade)
  application    Application? @relation(fields: [applicationId], references: [id], onDelete: SetNull)
}
```

Relations added: `User.tailorings Tailoring[]`, `Resume.tailorings Tailoring[]`, `Application.tailorings Tailoring[]`. Migration is **additive** (new table + nullable FK) — no reset.

`onDelete: SetNull` on `applicationId` keeps a tailoring's history even if the application is later deleted.

### 2. The AI piece — `src/lib/resume/tailor-prompt.ts`

Mirrors `src/lib/resume/prompt.ts` (`buildResumePrompt` + `ResumeAnalysisSchema`):

```ts
export interface TailoringResult {
  fitScore: number;                 // 0–100
  summary: string;                  // tailored professional summary paragraph
  keywordGaps: string[];            // JD terms missing/weak in the résumé
  tailoredBullets: { original: string; tailored: string }[];
  skillsToFeature: string[];        // skills to surface/reorder for this role
  strengths: string[];              // why the résumé fits THIS job
  gaps: string[];                   // where it falls short for THIS job
}
export const TailoringResultSchema: z.ZodType<TailoringResult>;
export function buildTailorPrompt(resumeText: string, jobDescription: string): { system: string; prompt: string };
```

The system prompt casts Gemini as an expert résumé tailor: compare the résumé to the JD, be specific and honest (don't invent experience the résumé lacks — surface it as a gap), and return only the JSON matching the schema. Runs through `analyze<TailoringResult>({system, prompt})`; the route Zod-validates the result.

### 3. Route — `POST /api/resume/tailor`

Follows the existing rate-limited AI-route pattern (`api/resume/upload`, `api/site`, `api/linkedin`).

- Auth: `requireUser()`.
- Rate limit: `rateLimit(\`tailor:${userId}\`, N, windowMs)` → 429 with `retryAfter` when exceeded (reuse the same limits as the other AI routes).
- Body: `{ jobDescription: string; applicationId?: string }`.
- Validate: non-empty `jobDescription` (else 400).
- Load the user's résumé: most-recent `Resume` (`orderBy createdAt desc`) scoped to the user. If none → 400 with a "upload a résumé first" code the UI surfaces.
- If `applicationId` given: load that application (scoped to the user) to snapshot `company`/`jobTitle`; ignore an unowned/missing id (tailoring still works, just unlabeled).
- `buildTailorPrompt(resume.text, jobDescription)` → `analyze()` → `TailoringResultSchema.parse()`. On any failure → 502/500, nothing saved.
- Persist a `Tailoring` (résumé id, JD snapshot, `fitScore`, `result`, optional application link/labels) and return `{ id, ...result }`.

The prompt-build + analyze + parse + persist logic lives in a testable `lib/resume/tailor.ts` (`generateTailoring({ userId, jobDescription, applicationId }, { client? })`) so the route stays thin and the AI client is injectable for tests.

### 4. UI

- **`/tailor` page** (`src/app/(app)/tailor/page.tsx`, Server Component shell + client form):
  - A résumé indicator (uses your latest résumé; a small picker only if the user has >1 résumé — pass the list from the server).
  - A **job-description textarea** + **Tailor** button. Prefills from `?applicationId=` (server reads the app's `description` and passes it as the initial value; the query also carries the id through to the POST).
  - Loading state during the request; on success render the **result view**:
    - **Fit score** dial/number + one-line rationale.
    - **Tailored summary** — text with a copy button.
    - **Keyword gaps** — chips.
    - **Tailored bullets** — original → tailored pairs, each tailored line with a copy button.
    - **Skills to feature** — chips.
    - **Strengths / Gaps** — two short lists.
  - Error states: no résumé (link to upload), rate-limited (show retry-after), generation failure (retry).
  - **History**: a list of the user's past tailorings (company/title or "Pasted JD", fit score, date) that reopen a saved result.
- **Prefill entry point**: a "Tailor résumé to this job" action in the application **detail panel** (and/or the spreadsheet row expand) that links to `/tailor?applicationId=<id>`. If the application has no `description`, the page opens with an empty textarea and a hint to paste one.
- **"Tailored ✓" marker**: applications with ≥1 tailoring show a small indicator (a `lastActivity`-adjacent badge or in the detail panel). Driven by a lightweight per-user set of `applicationId`s that have tailorings (one query on the applications page).
- **Nav**: add a **"Tailor"** link to `app-nav.tsx`.

### 5. Testing

- `buildTailorPrompt` — includes résumé text + JD, asks for the schema fields.
- `TailoringResultSchema` — accepts a valid result; rejects malformed (missing `fitScore`, wrong types, `tailoredBullets` without `original`/`tailored`).
- `generateTailoring` (`lib/resume/tailor.ts`) — with an injected fake `analyze` client: builds prompt from the latest résumé, persists a `Tailoring` with the snapshot + labels, returns the parsed result; no-résumé path throws the typed "no résumé" error; a malformed model response surfaces as a failure and saves nothing.
- Route handler — rate-limit gate (429), empty JD (400), success path returns `{id, ...result}` and calls `generateTailoring`; unauthenticated → redirect/401.
- UI — renders each result section + copy buttons; loading and the three error states; query-param prefill populates the textarea.
- Green gate: `npx tsc --noEmit`, `npm test`, `next build` all pass.

## Risks / notes

- **Latest-résumé assumption:** v1 tailors against the most recent `Resume`. If the user keeps several deliberately, the optional picker covers it; the default avoids a forced choice.
- **Model honesty:** the prompt must forbid fabricating experience — gaps belong in `gaps`, not invented into `tailoredBullets`. Covered by prompt wording; spot-checked in review, not unit-testable deterministically.
- **JD snapshot:** `jobDescription` is copied onto the `Tailoring` so a saved result stays meaningful even if the application's `description` later changes.
- **Sync latency:** a Gemini-flash call of a few seconds is held open by the route; acceptable within Vercel's function timeout. The button shows a loading state; the rate limiter bounds abuse.
- **`GOOGLE_GENERATIVE_AI_API_KEY` must be set** for real generation (as with existing resume analysis); absent it, the route returns a generation error the UI surfaces — the feature degrades gracefully rather than crashing.
