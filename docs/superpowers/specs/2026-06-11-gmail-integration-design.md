# Gmail Integration — Design

**Date:** 2026-06-11
**Status:** Approved (pending spec review)

## Goal

Let a user connect their Gmail so Hone reads job-search emails (application
confirmations, rejections, interview invites, offers) and updates the matching
`Application`'s status. High-confidence changes apply automatically and surface
in the dashboard Updates feed; lower-confidence changes surface as suggestions
the user confirms.

## Foundation already in place (do not rebuild)

- **Updates feed:** `getRecentAppUpdates` (`src/lib/health/app-updates.ts`)
  reads `ApplicationEvent` rows in a recent window. Any event written there
  surfaces in the dashboard automatically — no dashboard changes needed for
  auto-applied updates.
- **Event write path:** `recordApplicationEvent` (`src/lib/applications/events.ts`).
- **Status changes:** `src/lib/applications/actions.ts`
  (`updateStatus`, `markAppliedToday`, `createManualApplication`).
- **Auth:** Auth.js v5 (`next-auth` 5.0.0-beta.31) with Google provider,
  `PrismaAdapter`, **database sessions** (`src/lib/auth.ts`). The `Account`
  model already stores `refresh_token`/`access_token`/`expires_at`/`scope`. The
  base Google provider currently requests **no** Gmail scope and **no** offline
  access.
- **Background jobs:** Trigger.dev (`trigger.config.ts`, `src/trigger/*`).
  `poll-jobs.ts` is the scheduled-task template.
- **AI:** the project classifies via **Google Gemini** (`gemini-2.5-flash`)
  through `analyze()` in `src/lib/ai/provider.ts`. (Note: there is no Anthropic
  dependency in this repo despite earlier framing — we reuse Gemini.)

## Resolved decisions

| Decision | Choice |
|---|---|
| Email → Application matching | Match tracked Applications by company (sender domain + fuzzy name) + thread. Untracked job emails become **suggestions**, never silently created. |
| Auto-update vs confirm | **Hybrid by confidence.** `confidence ≥ 0.8` auto-applies + logs an event; `< 0.8` becomes a suggestion. |
| Sync mechanism | **Trigger.dev scheduled polling** + Gmail **History API** incremental sync (no Pub/Sub). |
| Classifier | **Reuse Gemini** (`analyze()` / `gemini-2.5-flash`). |
| Suggestion surface | A **"Suggested updates" card** on the dashboard digest (not a separate page). |

The confidence threshold constant is `0.8`.

---

## 1. OAuth & token storage

Base Google sign-in stays **minimal** (no Gmail scope) so signup is a light
ask. A separate **"Connect Gmail"** action in Settings re-runs Google OAuth with
the Gmail scope.

- Connect action (server action) calls:
  ```ts
  signIn("google",
    { redirectTo: "/settings" },
    { scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent" })
  ```
  `access_type=offline` + `prompt=consent` force Google to return a
  **refresh token** even on re-auth.
  *Implementation note:* confirm the exact Auth.js v5 signature for passing
  per-call `authorizationParams` against `node_modules/next/dist/docs` /
  next-auth docs before wiring; fall back to a provider-level
  `authorization.params` config if the third-arg form isn't supported.
- **Token persistence:** in the `signIn` callback (which receives the fresh
  `account`), upsert `refresh_token`/`access_token`/`expires_at`/`scope` onto the
  existing `Account` row. This is deliberate — the PrismaAdapter does not
  reliably update tokens on re-auth, so we own that write. Only overwrite
  `refresh_token` when Google actually returns one (it may be absent on some
  re-auths).
- **`refreshAccessToken(userId)` helper:** reads the user's Google `Account`;
  if `expires_at` is past (or within a small skew), POSTs the
  `grant_type=refresh_token` request to `https://oauth2.googleapis.com/token`,
  writes back the new `access_token` + `expires_at`, and returns a valid access
  token. Called before every Gmail API request.
- **Gmail client:** a thin `fetch` wrapper over the Gmail REST API — **no
  `googleapis` dependency** (consistent with the existing job-board fetchers).
- **Disconnect:** Settings button → revoke the token at Google's revoke
  endpoint (`https://oauth2.googleapis.com/revoke`), delete the
  `GmailConnection` row and the user's stored `EmailInsight` rows.

## 2. Data model (Prisma)

```prisma
enum AppEventType {
  created
  status_change
  email_detected            // NEW — promote the reserved comment to a real value
}

enum EmailOutcome {
  auto_applied
  suggested
  accepted
  dismissed
}

model GmailConnection {
  userId       String    @id            // 1:1 with User
  historyId    String?                  // incremental sync cursor
  syncEnabled  Boolean   @default(true)
  connectedAt  DateTime  @default(now())
  lastSyncedAt DateTime?
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model EmailInsight {                     // audit log + suggestion queue + dedup guard
  id              String       @id @default(cuid())
  userId          String
  messageId       String       @unique   // Gmail msg id → dedup, idempotent reprocessing
  threadId        String?
  fromEmail       String
  subject         String?
  snippet         String?                // short snippet only — never the full body
  kind            String                 // "status_change" | "new_application"
  suggestedStatus AppStatus?
  applicationId   String?                // set when matched to a tracked app
  company         String?                // for new_application suggestions
  title           String?
  confidence      Float
  outcome         EmailOutcome
  createdAt       DateTime     @default(now())
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  application     Application? @relation(fields: [applicationId], references: [id], onDelete: SetNull)
}
```

- Add the `appEvents`-style back-relations on `User` (`gmailConnection`,
  `emailInsights`) and on `Application` (`emailInsights`).
- `EmailInsight.messageId @unique` is the dedup guard — a re-run never
  double-processes a message.
- `GmailConnection.historyId` is the only sync cursor.
- After `prisma migrate`/`generate`, **restart the dev server** (Turbopack
  won't reload the Prisma client) — port 3050.

## 3. Sync pipeline — Trigger.dev scheduled task `sync-gmail`

Modeled on `poll-jobs.ts`. Runs on a cron (e.g. every 15 min).

For each `GmailConnection` with `syncEnabled` and a refresh token on the
`Account`:

1. **Incremental fetch:** `history.list(startHistoryId = connection.historyId)`
   → new message IDs. Forward-only from connect time; **no backfill** of old
   mail. On connect, seed `historyId` from `users.getProfile`.
   - If `historyId` is missing/expired (Gmail 404 on history), reseed from
     `getProfile` and skip this run's processing (avoids a full-mailbox scan).
2. **Job-relevance gate** (`relevance.ts`, pure heuristic, runs **before any
   model call**): keep a message only if its sender domain is a known ATS
   (greenhouse, lever, ashby, workday, greenhouse-mail, etc.) **or** its subject
   matches job keywords (application, interview, position, role, candidate,
   offer, "unfortunately", "next steps", …). Everything else is dropped —
   **never sent to Gemini, never stored.** This is the privacy boundary.
3. **Fetch + classify:** `messages.get` for surviving messages, then `analyze()`
   (Gemini) returns `{ status, confidence, company, title, reason }` validated
   by a zod schema. `status ∈ { applied, interviewing, offer, rejected, none }`.
4. **Match** (`match.ts`, pure): find a tracked `Application` for this user by
   company (sender domain ↔ `Job.company` + fuzzy name) and/or thread.
5. **Branch:**
   - **Matched + `confidence ≥ 0.8`:** apply the status change (reuse the
     `updateStatus` logic / direct update) and
     `recordApplicationEvent({ type: "email_detected", fromStatus, toStatus, summary })`.
     Log `EmailInsight { outcome: auto_applied }`. Surfaces in Updates feed
     automatically. Skip if the application is already in that status.
   - **Matched + `confidence < 0.8`:** log `EmailInsight { kind:
     "status_change", outcome: suggested, applicationId, suggestedStatus }`.
   - **No match (any confidence):** log `EmailInsight { kind:
     "new_application", outcome: suggested, company, title, suggestedStatus }`.
   - `status === "none"`: log nothing (or a dropped marker) — no event, no
     suggestion.
6. **Advance cursor:** store the largest `historyId` seen on the connection;
   stamp `lastSyncedAt`.

Idempotency: `messageId @unique` means a partial-failure re-run is safe.

## 4. Surfacing suggestions

- **Auto-applied** changes already appear in the dashboard Updates feed via the
  `email_detected` events — no dashboard work for those.
- **Suggested** insights (`outcome: suggested`) render in a new **"Suggested
  updates"** card on the dashboard digest:
  - `status_change` → *"Acme → Rejected (from email)"* with **Confirm /
    Dismiss**.
  - `new_application` → *"Track Acme — Software Engineer? (from email)"* with
    **Confirm / Dismiss**.
- **Confirm** (server action in `src/lib/gmail/suggestions.ts`):
  - status_change → apply the status change to the matched Application + write
    the `email_detected` event; set insight `outcome: accepted`.
  - new_application → create a paste-source `Job` + `Application` (mirroring
    `createManualApplication`), which writes the `created` event; set insight
    `outcome: accepted`.
- **Dismiss** → set insight `outcome: dismissed`; it leaves the card.

## 5. Module layout

```
src/lib/gmail/
  oauth.ts        // connect/disconnect server actions, refreshAccessToken, token persistence
  client.ts       // thin fetch wrapper: history.list, messages.get, getProfile
  relevance.ts    // heuristic job-relevance gate (pure, unit-testable)
  classify.ts     // Gemini prompt + zod schema → { status, confidence, company, title, reason }
  match.ts        // email → Application matching (pure, unit-testable)
  suggestions.ts  // confirm / dismiss server actions
src/trigger/sync-gmail.ts   // scheduled task orchestrating the above
```

Settings page (`src/app/(app)/settings/page.tsx`) gains a **Gmail** card:
Connect / Disconnect, connection status, last-synced time.

## 6. Privacy & security

- Request only `gmail.readonly` — no send/modify scope.
- Non-job-relevant mail is filtered out **before** any external (Gemini) call
  and is never stored.
- Store only `messageId`, `threadId`, `fromEmail`, `subject`, a short `snippet`,
  and the classification — never full email bodies.
- Disconnect revokes the Google token and deletes the connection + insights.
- Forward-only sync: we never scan historical mail.

## 7. Testing

- `relevance.ts`: unit tests over sample sender domains / subjects (job vs not).
- `match.ts`: unit tests for company/domain/thread matching incl. fuzzy names
  and no-match.
- `classify.ts`: schema-validation tests with a stubbed `analyze()` client
  (the `analyze` helper already supports an injectable client) covering each
  status + low/high confidence.
- `recordApplicationEvent` emission for `email_detected` (mirror the existing
  `markAppliedToday` event test).
- Suggestion confirm/dismiss server-action tests (status_change apply +
  new_application create paths).

## Out of scope (YAGNI)

- Pub/Sub push notifications.
- Backfill / historical mailbox scan.
- Multi-account Gmail.
- A dedicated suggestions inbox page (the dashboard card covers it).
- Sending or modifying mail.

## Conventions

- Dev server on port **3050**; restart after any `prisma migrate`/`generate`.
- Commit on `main` and push directly (personal project, no PRs).
- This is a **customized** Next.js — read the relevant guide in
  `node_modules/next/dist/docs` before writing route/handler/auth code.
