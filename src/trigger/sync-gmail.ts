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
