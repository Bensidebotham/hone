import { prisma } from "@/lib/db";

/**
 * - `connected`    — sync is working.
 * - `needs_reauth` — the user connected Gmail, but the grant is dead and only
 *                    re-consenting can fix it.
 * - `disconnected` — never connected. Deliberately distinct from
 *                    `needs_reauth` so new users are never told to "reconnect"
 *                    something they never connected.
 */
export type GmailState = "connected" | "needs_reauth" | "disconnected";

export interface GmailStatus {
  state: GmailState;
  /** Last successful sync, for telling the user how long they've been blind. */
  lastSyncedAt: Date | null;
}

const GMAIL_READONLY = "gmail.readonly";

/**
 * Single source of truth for how healthy a user's Gmail link is, shared by the
 * dashboard banner and the Settings card so the two can never disagree.
 */
export async function getGmailStatus(userId: string): Promise<GmailStatus> {
  const [connection, account] = await Promise.all([
    prisma.gmailConnection.findUnique({
      where: { userId },
      select: { needsReauth: true, lastSyncedAt: true },
    }),
    prisma.account.findFirst({
      where: { userId, provider: "google" },
      select: { scope: true, refresh_token: true },
    }),
  ]);

  if (!connection) return { state: "disconnected", lastSyncedAt: null };

  // The credential checks are derived live rather than read from needsReauth
  // alone, so a grant that disappears shows up immediately instead of waiting
  // for the next 15-minute sync to notice.
  const credentialsIntact =
    Boolean(account?.refresh_token) && Boolean(account?.scope?.includes(GMAIL_READONLY));

  return {
    state: connection.needsReauth || !credentialsIntact ? "needs_reauth" : "connected",
    lastSyncedAt: connection.lastSyncedAt,
  };
}
