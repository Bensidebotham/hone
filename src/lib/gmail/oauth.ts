"use server";

import { signIn, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";

const GMAIL_SCOPE = "openid email profile https://www.googleapis.com/auth/gmail.readonly";

/** Start the incremental Gmail OAuth consent (adds gmail.readonly + offline access). */
export async function connectGmail() {
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
    data: { scope: "openid email profile" },
  });

  revalidatePath("/settings");
}

interface RefreshResult { accessToken: string }

/**
 * Return a valid Google access token for the user, refreshing via the stored
 * refresh_token when the current one is expired (or within 60s of expiry).
 */
export async function refreshAccessToken(userId: string): Promise<RefreshResult | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account?.refresh_token) return null;

  const stillValid = account.access_token && account.expires_at && account.expires_at - 60 > Math.floor(Date.now() / 1000);
  if (stillValid) return { accessToken: account.access_token! };

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });
  if (!res.ok) return null;

  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in;
  await prisma.account.updateMany({
    where: { userId, provider: "google" },
    data: { access_token: json.access_token, expires_at: expiresAt },
  });
  return { accessToken: json.access_token };
}
