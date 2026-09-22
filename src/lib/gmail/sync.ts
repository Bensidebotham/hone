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
  /** Distinct ids the queries returned, ledgered or not. */
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
