import { schedules } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { refreshAccessToken } from "@/lib/gmail/oauth";
import { shouldFlagReauth } from "@/lib/gmail/token";
import { getProfile, listHistory, listRecentMessages, getMessage } from "@/lib/gmail/client";
import { isJobRelevant } from "@/lib/gmail/relevance";
import { classifyEmail } from "@/lib/gmail/classify";
import { matchApplication, type AppCandidate } from "@/lib/gmail/match";
import { decideEmailAction } from "@/lib/gmail/decide";
import { applyDecision } from "@/lib/gmail/apply";

/**
 * How far back a catch-up scan reaches. Sized to cover a multi-week outage
 * (a revoked Google grant can go unnoticed for weeks), not just the ~1 week
 * of history.list retention.
 */
const CATCH_UP_DAYS = 30;

/** Bounds one catch-up: every id here costs a messages.get. */
const CATCH_UP_MAX_MESSAGES = 500;

export const syncGmail = schedules.task({
  id: "sync-gmail",
  cron: "*/15 * * * *", // every 15 minutes
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
        const accessToken = token.accessToken;

        // The grant works, so clear any previous warning.
        if (conn.needsReauth) {
          await prisma.gmailConnection.update({
            where: { userId: conn.userId },
            data: { needsReauth: false },
          });
        }

        // Two ways to arrive without a usable cursor: a fresh connect (or
        // reconnect, which clears it), and a cursor Gmail has since purged.
        // Both mean mail arrived while we weren't watching, and history.list
        // cannot reach back past roughly a week — so the only way to recover
        // it is to scan the mailbox by date.
        let catchUp = !conn.historyId;
        let messageIds: string[] = [];
        let latestHistoryId: string | null = conn.historyId;

        if (!catchUp) {
          try {
            const res = await listHistory(accessToken, conn.historyId!);
            messageIds = res.messageIds;
            latestHistoryId = res.latestHistoryId;
          } catch (err: any) {
            if (err?.status !== 404) {
              console.warn(`[sync-gmail] history.list failed for ${conn.userId}`, err);
              continue;
            }
            catchUp = true;
          }
        }

        if (catchUp) {
          messageIds = await listRecentMessages(accessToken, {
            days: CATCH_UP_DAYS,
            max: CATCH_UP_MAX_MESSAGES,
          });
          // Take the cursor from the profile so the next run resumes
          // incrementally from now, whatever the scan turned up.
          const { historyId } = await getProfile(accessToken);
          latestHistoryId = historyId;

          if (messageIds.length >= CATCH_UP_MAX_MESSAGES) {
            console.warn(
              `[sync-gmail] catch-up for ${conn.userId} hit the ${CATCH_UP_MAX_MESSAGES}-message cap — older mail in the ${CATCH_UP_DAYS}-day window was not scanned`
            );
          } else {
            console.log(
              `[sync-gmail] catching up ${conn.userId}: scanning ${messageIds.length} messages from the last ${CATCH_UP_DAYS} days`
            );
          }
        }

        // Candidate applications for matching (this user's tracked apps).
        const apps = await prisma.application.findMany({
          where: { userId: conn.userId },
          select: { id: true, company: true, status: true },
        });
        const candidates: AppCandidate[] = apps.map((a) => ({
          applicationId: a.id, company: a.company, status: a.status,
        }));

        // If any message fails to fetch/process, hold the cursor so it retries
        // next run. The per-message dedup guard makes already-processed messages
        // safe to re-see, so we never silently drop a status update.
        let heldBack = false;

        for (const id of messageIds) {
          // Dedup: never reprocess a message we already logged.
          const seen = await prisma.emailInsight.findUnique({ where: { messageId: id }, select: { id: true } });
          if (seen) continue;

          try {
            const msg = await getMessage(accessToken, id);

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
          } catch (err) {
            console.warn(`[sync-gmail] processing failed for message ${id}`, err);
            heldBack = true;
          }
        }

        await prisma.gmailConnection.update({
          where: { userId: conn.userId },
          data: {
            // Only advance the cursor when the whole batch succeeded.
            historyId: heldBack ? conn.historyId : latestHistoryId ?? conn.historyId,
            lastSyncedAt: new Date(),
          },
        });
      } catch (err) {
        console.warn(`[sync-gmail] sync failed for user ${conn.userId}`, err);
      }
    }

    return { connections: connections.length, processed };
  },
});
