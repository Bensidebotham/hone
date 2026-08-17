"use server";

import { signIn, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isDemoEmail } from "@/lib/demo/config";
import { isUnrecoverable, type TokenResult } from "@/lib/gmail/token";

const GMAIL_SCOPE = "openid email profile https://www.googleapis.com/auth/gmail.readonly";

/** Start the incremental Gmail OAuth consent (adds gmail.readonly + offline access). */
export async function connectGmail() {
  const user = await requireUser();
  // The demo account can't connect a real inbox.
  if (isDemoEmail(user.email)) redirect("/settings");
  await signIn(
    "google",
    { redirectTo: "/settings" },
    { scope: GMAIL_SCOPE, access_type: "offline", prompt: "consent" }
  );
}

/** Revoke the Google token, drop the connection and stored insights. */
export async function disconnectGmail() {
  const user = await requireUser();
  const account = await prisma.account.findFirst({
    where: { userId: user.id, provider: "google" },
    select: { access_token: true },
  });

  if (account?.access_token) {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: account.access_token }),
    }).catch(() => {}); // best-effort
  }

  await prisma.emailInsight.deleteMany({ where: { userId: user.id } });
  await prisma.gmailConnection.deleteMany({ where: { userId: user.id } });
  await prisma.account.updateMany({
    where: { userId: user.id, provider: "google" },
    data: { scope: "openid email profile", access_token: null, refresh_token: null, expires_at: null },
  });

  revalidatePath("/settings");
}

/**
 * Return a valid Google access token for the user, refreshing via the stored
 * refresh_token when the current one is expired (or within 60s of expiry).
 *
 * Callers must branch on `reason` rather than treating every failure alike —
 * conflating "no token stored" with "Google rejected the token" is what let a
 * revoked grant masquerade as a healthy connection for a month.
 */
export async function refreshAccessToken(userId: string): Promise<TokenResult> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account?.refresh_token) return { ok: false, reason: "no_token" };

  const stillValid = account.access_token && account.expires_at && account.expires_at - 60 > Math.floor(Date.now() / 1000);
  if (stillValid) return { ok: true, accessToken: account.access_token! };

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
      }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  if (!res.ok) {
    return { ok: false, reason: isUnrecoverable(res.status) ? "revoked" : "network" };
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in;
  await prisma.account.updateMany({
    where: { userId, provider: "google" },
    data: { access_token: json.access_token, expires_at: expiresAt },
  });
  return { ok: true, accessToken: json.access_token };
}
