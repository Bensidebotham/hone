# Gmail sync: search-first detection + auto-add to tracker

**Date:** 2026-09-23
**Status:** Approved (design)

## Why

Two problems, one request: "auto add applications it finds into the tracker" and "it seems to be missing a lot".

**Diagnosis (2026-09-23):**

1. **The sync has not executed since 2026-09-09 ~11:45 UTC.** The Trigger.dev deploy (`20260818.1`) is healthy, but every `sync-gmail` run sits `queued` until its 14-day TTL expires. That's an account-level block (usage limit or paused environment), not a code bug — but the `*/15` cron is the likely credit burner. Every application Ben's Paseo Careers tab found after Sep 9 (Anduril, Scale AI, Citadel, Lightfield, Lennar, Zip, Jane Street, Bloomberg, Amex, Visa, Capital One, Amazon, NVIDIA, Twitch, GM, Authentic, …) never reached Hone.
2. **Recovery can't reach back.** When runs resume, the `historyId` cursor is >1 week stale → `history.list` 404s → a 30-day `newer_than:` scan capped at the **500 newest** messages. Ben's inbox exceeds that, so the Sep 9 outage window is likely out of reach.
3. **Detection gaps even when running.** `isJobRelevant` looks only at sender domain + subject substring. It has no assessment platforms (CodeSignal, HackerRank, HireVue…), no Oracle Cloud / Workday OTP senders, never looks for mail about companies already tracked, and never looks at the body. career-ops' own notes record the same failure modes ("queries blind to company names", "queries too narrow").
4. **New applications never land automatically.** An unmatched email becomes a `new_application` suggestion that needs a manual Confirm — and Confirm silently no-ops when the LLM returned no title (Valon and three Roblox suggestions are stuck that way today). Several emails from one new company produce several suggestions.

Paseo's Careers tab and career-ops' `modes/_custom.md` both find more because they **search Gmail with targeted queries** (ATS senders, phrases, assessment platforms, tracked-company sweep) rather than scanning everything and keyword-filtering locally. This design adopts that approach.

## Goals

- Replace "scan all new mail → subject-keyword filter" with **targeted Gmail search queries** each run (the career-ops query set, adapted).
- **Auto-add** confidently-detected new applications straight into the tracker, deduped, with an Undo.
- Recover everything missed **since 2026-07-01** via a one-time backfill.
- Make outage recovery independent of the stale `historyId` cursor and the 500-message cap.

## Non-goals

- Fixing the Paseo Careers tab or career-ops' scheduled prompt.
- Importing the career-ops tracker (`applications.md`) into Hone.
- Undo for auto-applied *status changes* (only for auto-*added* applications).
- Unblocking the Trigger.dev account — Ben does that in the dashboard.

## Design

### 1. Finding the mail

**`src/lib/gmail/queries.ts` (new)** — the single source of the job-mail vocabulary:

- `ATS_DOMAINS` (moved here from `relevance.ts`/`match.ts`, extended): `greenhouse.io, greenhouse-mail.io, lever.co, ashbyhq.com, myworkday.com, workday.com, icims.com, smartrecruiters.com, jobvite.com, successfactors.com, taleo.net, oraclecloud.com, cloud.oracle.com, eightfold.ai, workable.com, applytojob.com, bamboohr.com, teamtailor.com, breezy.hr, rippling.com`. (`workday.com` covers `{company}@otp.workday.com` candidate-account mail; `cloud.oracle.com` covers JPMorgan's `…mail.us2.cloud.oracle.com` confirmation.)
- `ASSESSMENT_DOMAINS`: `codesignal.com, hackerrank.com, hackerrankforwork.com, hirevue.com, karat.com, codility.com, testgorilla.com, coderpad.io, byteboard.dev`.
- `buildSearchQueries({ after: Date, trackedCompanies: string[] }): string[]` returns, each suffixed with `after:<unix-seconds>`:
  1. ATS senders: `from:(greenhouse.io OR lever.co OR …)`
  2. Confirmations: `("thank you for applying" OR "thanks for applying" OR "application received" OR "received your application" OR "we received your application" OR "your application to" OR "application confirmation" OR "thank you for your interest")`
  3. Rejections: `("not moving forward" OR "move forward with other candidates" OR "pursue other candidates" OR "decided not to proceed" OR "not been selected" OR "regret to inform" OR "unable to offer" OR "your candidacy" OR "update on your application")`
  4. Interviews / next steps: `(subject:interview OR "schedule a call" OR "phone screen" OR "next steps" OR "invite you to interview" OR "schedule your interview")`
  5. Assessments: `from:(codesignal.com OR hackerrank.com OR …)` and `subject:(assessment OR "coding challenge" OR "online assessment")`
  6. Tracked-company sweep: active tracker companies (status `applied`/`interviewing`/`offer`), deduped, in chunks of 10: `("Jane Street" OR "Citadel" OR …) (application OR applied OR interview OR assessment OR candidate OR recruiter OR "next steps")`. The job-word clause keeps consumer marketing from Visa/Amex/Amazon out. Company names are quoted with `"` stripped.
- Gmail search matches body text as well as headers, which is the main recall gain over the subject-only filter.

**`src/lib/gmail/client.ts`**

- New `searchMessages(accessToken, q, { max }): Promise<string[]>` — paginated `messages.list?q=`, same no-progress guard as `listRecentMessages`.
- `getMessage` also returns `receivedAt: Date` from `internalDate`.
- `listHistory` and `listRecentMessages` are removed (no remaining callers).

**The run window.** `after = (lastSyncedAt ?? now − 30d) − 2 days`, floored at `SYNC_FLOOR = 2026-07-01`. The 2-day overlap absorbs Gmail indexing lag and clock skew; the ledger (below) makes overlap free. `GmailConnection.historyId` is no longer read or written (column left in place; dropping it is not worth a migration).

**The privacy gate moves to the queries.** `isJobRelevant` and `relevance.ts` are deleted: the queries are now the only thing that decides what reaches the model, and they only return job-shaped mail. (A local filter kept after the queries would re-introduce exactly the subject-only misses this fixes.)

**Ledger every classified message.** `EmailOutcome` gains `ignored`. A message the classifier says is `none` gets an `EmailInsight` with `outcome: ignored` (kind `status_change`, no application). So does a match that's skipped (already in status / would regress). The existing `messageId @unique` dedup check then covers every message the model has seen — no reclassification across overlapping windows, and a readable audit trail. `ignored` rows never surface in the UI.

**Classifier prompt (`classify.ts`)** — same schema, sharper rules:

- `none` explicitly includes: job ads / "position now available" / "we're hiring", job-alert digests, LinkedIn / Indeed / Handshake notifications, recruiter cold outreach about a role the applicant didn't apply to, and newsletters.
- Online-assessment invitations and reminders (CodeSignal, HackerRank, HireVue, …) → `interviewing`.
- `title`: take it from the subject if the body doesn't name it; null only if neither does.
- `confidence` is defined as certainty that this is about an application the recipient themself submitted *and* of the status.
- Input gains `Date:`; body budget stays 2000 chars.

### 2. Writing to the tracker

**Decision (`decide.ts`)** — `Decision` gains `create`; order of checks:

1. `status === none` → `ignore`.
2. Matched an app:
   - same status → `ignore` ("already in status");
   - **would regress** → `ignore`. Rank `saved < applied < interviewing < offer`; `rejected` and `offer` are terminal for automation (nothing auto-moves out of them); anything may move *to* `rejected`. This matters for the backfill, where an old confirmation can be processed after the app is already `interviewing`.
   - confidence ≥ 0.8 → `auto_apply`, else `suggest_status` (unchanged).
3. Unmatched:
   - company present && confidence ≥ 0.8 → **`create`**;
   - else → `suggest_new` (unchanged).

(`skip` is renamed `ignore` because it now writes a ledger row.)

**Apply (`apply.ts`)** — new `create` branch, in one `prisma.$transaction`:

- `Application`: `company`, `title ?? "Role not specified"`, `status` = classified status, `appliedAt` = email `receivedAt`, `source: "Email"`.
- `ApplicationEvent` `created` (toStatus = status, summary "Added from email").
- `EmailInsight` `kind: new_application`, `outcome: auto_applied`, `applicationId` linked, company/title set.
- Returns the new app's `{ id, company, title, status }` so the caller can add it to the in-run candidate list.

`ignore` writes the `ignored` ledger row. The other branches are unchanged.

**In-run dedup + ordering (`sync-gmail.ts`).** After collecting ids and filtering already-ledgered ones, fetch messages and **sort by `receivedAt` ascending**, so a confirmation creates the app and that company's later rejection updates it. Each `create` result is pushed into `candidates`; `auto_apply` still updates the candidate's status in place.

**Matching (`match.ts`)**

- Candidates carry `title`. Among all candidates whose company matches, prefer one whose normalized title overlaps the email's title (shared significant word, >3 chars); otherwise the most recently created. (Replaces "first `findMany` hit wins".)
- Company comparison: exact normalized equality, or containment only when the shorter key is ≥ 5 chars. ("Meta" no longer matches "Metabase".)
- Sender token uses the registrable domain label (second-to-last, or third-to-last for `co.uk`-style two-letter SLDs): `email.roblox.com` → `roblox`, not `email`.
- Generic-domain check uses suffix matching (`hire.lever.co` is generic), sharing `ATS_DOMAINS` + `ASSESSMENT_DOMAINS` + webmail from `queries.ts`.

**Confirm/dismiss (`suggestions.ts`)**

- `confirmSuggestion` for `new_application`: requires only `company`; title falls back to `"Role not specified"`; `appliedAt` stays confirm time (email date isn't stored on the insight — acceptable for the manual path). Before creating, it runs `matchApplication` against the user's apps; on a match it links the insight instead of creating a duplicate. Sets `insight.applicationId` either way.
- New `undoAutoAdd(insightId)`: ownership check; only for `kind new_application` + `outcome auto_applied`; deletes the linked Application (events cascade) and sets the insight to `dismissed` with `applicationId: null`. That email can then never re-create it.
- New `getRecentAutoAdds(userId, days = 7)`: `new_application` + `auto_applied` insights with a live application, newest first.

**Dashboard.** `SuggestedUpdates` becomes "From your email" and renders two groups: **Added** (recent auto-adds: "Company — Title", status badge, email preview, **Undo**) and **Needs review** (pending suggestions with Confirm/Dismiss, as today). The card hides when both are empty. `summary.ts` fetches both.

### 3. Rollout

- **Cadence and batching.** Cron `0 * * * *` (hourly). Task `maxDuration: 900`. At most `MAX_PER_RUN = 150` new (un-ledgered) messages classified per run, oldest first. `lastSyncedAt` advances to the run's start time **only** if every message processed without error and the cap wasn't hit; otherwise it stays put and the next run resumes (ledgered messages are skipped for free).
- **Structure.** Extract the per-connection body into `syncConnection(conn, deps)` in `src/lib/gmail/sync.ts` so it's unit-testable with injected Gmail/classifier/db deps; the Trigger task keeps token handling and the loop over connections.
- **Backfill.** A one-off script `scripts/gmail-backfill.ts` sets `lastSyncedAt = 2026-07-03` for a given user (→ window starts Jul 1 after the 2-day overlap). Hourly runs then drain the backlog in ≤150-message batches.
- **Migration.** `ALTER TYPE "EmailOutcome" ADD VALUE 'ignored'`.
- **Deploy.** Vercel ships the UI; the task needs `pnpm deploy:trigger` separately, and only runs once the Trigger.dev account is unblocked.

## Testing

Vitest, following the existing `src/lib/gmail/*.test.ts` pattern:

- `queries.test.ts`: every group present; `after:` epoch; tracked companies chunked by 10, quotes stripped, deduped, only active statuses; floor date respected by the window helper.
- `client.test.ts`: `searchMessages` pagination/cap/no-progress; `getMessage` `receivedAt`.
- `classify.test.ts`: prompt contains the new `none` exclusions, assessment rule, and `Date:`.
- `decide.test.ts`: `create` at ≥0.8 with company; `suggest_new` below or without company; regression → `ignore`; nothing leaves `rejected`/`offer`; anything → `rejected` allowed.
- `match.test.ts`: registrable-domain token; ATS subdomain generic; short-name containment rejected; title preference among same-company apps.
- `apply.test.ts` (new): `create` transaction writes app + event + linked insight; `ignore` writes an `ignored` row.
- `sync.test.ts` (new): oldest-first processing; confirmation-then-rejection yields one app ending `rejected`; ledgered ids skipped; cap and per-message failure both hold `lastSyncedAt`.
- `suggestions.test.ts`: confirm without title uses placeholder; confirm links to an existing match instead of duplicating; `undoAutoAdd` deletes + dismisses, rejects foreign users and non-auto-add insights.

## Risks

- **Query recall is still a vocabulary.** A company that emails from its own domain with none of the phrases, and isn't tracked yet, is missed. The tracked-company sweep and the broad confirmation phrases cover most of it; misses can be added to `queries.ts` as they're found.
- **Auto-add false positives.** Mitigated by the tightened `none` rules and the 0.8 floor; the dashboard Undo is the escape hatch.
- **Disconnect wipes the ledger.** `disconnectGmail` deletes all `EmailInsight` rows and the connection, so a reconnect (fresh connection, no `lastSyncedAt` → 30-day window) can re-add an app the user had undone in that window. Accepted: disconnect/reconnect is rare, and Undo is one click.
- **Gemini volume during backfill.** ~Jul–Sep of job mail at ≤150/run is a few hundred flash calls spread over a few hours.
