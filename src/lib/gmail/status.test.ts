import { describe, it, expect, vi, beforeEach } from "vitest";

const connectionFindUnique = vi.fn();
const accountFindFirst = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    gmailConnection: { findUnique: (...a: any) => connectionFindUnique(...a) },
    account: { findFirst: (...a: any) => accountFindFirst(...a) },
  },
}));

import { getGmailStatus } from "@/lib/gmail/status";

const GMAIL_SCOPE = "openid email profile https://www.googleapis.com/auth/gmail.readonly";
const SYNCED = new Date("2026-07-20T04:32:14Z");

beforeEach(() => {
  connectionFindUnique.mockReset();
  accountFindFirst.mockReset();
});

describe("getGmailStatus", () => {
  it("reports disconnected when the user has never connected an inbox", async () => {
    connectionFindUnique.mockResolvedValue(null);
    accountFindFirst.mockResolvedValue(null);

    expect(await getGmailStatus("u1")).toEqual({ state: "disconnected", lastSyncedAt: null });
  });

  it("reports connected for a healthy connection and exposes the last sync time", async () => {
    connectionFindUnique.mockResolvedValue({ needsReauth: false, lastSyncedAt: SYNCED });
    accountFindFirst.mockResolvedValue({ scope: GMAIL_SCOPE, refresh_token: "rt" });

    expect(await getGmailStatus("u1")).toEqual({ state: "connected", lastSyncedAt: SYNCED });
  });

  // The flag the sync task sets after Google rejects the refresh token.
  it("reports needs_reauth when sync flagged the grant as revoked", async () => {
    connectionFindUnique.mockResolvedValue({ needsReauth: true, lastSyncedAt: SYNCED });
    accountFindFirst.mockResolvedValue({ scope: GMAIL_SCOPE, refresh_token: "rt" });

    expect(await getGmailStatus("u1")).toEqual({ state: "needs_reauth", lastSyncedAt: SYNCED });
  });

  // Derived directly rather than waiting for the next cron run, so the warning
  // appears immediately instead of up to 15 minutes later.
  it("reports needs_reauth when the stored refresh token has gone missing", async () => {
    connectionFindUnique.mockResolvedValue({ needsReauth: false, lastSyncedAt: SYNCED });
    accountFindFirst.mockResolvedValue({ scope: GMAIL_SCOPE, refresh_token: null });

    expect(await getGmailStatus("u1")).toMatchObject({ state: "needs_reauth" });
  });

  it("reports needs_reauth when the gmail.readonly scope was dropped", async () => {
    connectionFindUnique.mockResolvedValue({ needsReauth: false, lastSyncedAt: SYNCED });
    accountFindFirst.mockResolvedValue({ scope: "openid email profile", refresh_token: "rt" });

    expect(await getGmailStatus("u1")).toMatchObject({ state: "needs_reauth" });
  });

  // A user who never connected must never be nagged to "reconnect".
  it("stays disconnected rather than needs_reauth when there is no connection row", async () => {
    connectionFindUnique.mockResolvedValue(null);
    accountFindFirst.mockResolvedValue({ scope: "openid email profile", refresh_token: null });

    expect(await getGmailStatus("u1")).toMatchObject({ state: "disconnected" });
  });
});
