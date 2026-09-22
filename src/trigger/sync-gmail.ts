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
