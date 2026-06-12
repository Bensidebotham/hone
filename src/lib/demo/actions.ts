"use server";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ensureFreshDemo } from "@/lib/demo/seed";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Log a visitor straight into the shared demo account (no OAuth). Mints an
 * Auth.js database Session row and sets the session cookie, mirroring what the
 * Prisma adapter does after a normal sign-in.
 */
export async function startDemo(): Promise<void> {
  const user = await ensureFreshDemo();

  const sessionToken = randomUUID();
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);
  await prisma.session.create({
    data: { sessionToken, userId: user.id, expires },
  });

  // Auth.js prefixes the cookie with __Secure- when cookies are secure (HTTPS).
  const secure = process.env.NODE_ENV === "production";
  const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const cookieStore = await cookies();
  cookieStore.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });

  redirect("/dashboard");
}
