import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { connectionUpdateOnSignIn } from "@/lib/gmail/connection";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Trust the deployment host (Vercel sets X-Forwarded-Host). Without this,
  // Auth.js v5 in production rejects the host (UntrustedHost) and diverts
  // protected routes to its own sign-in page instead of honoring requireUser().
  trustHost: true,
  session: { strategy: "database" },
  providers: [Google],
  callbacks: {
    async signIn({ user, account }) {
      // When the Connect-Gmail flow re-auths with gmail.readonly, capture the
      // refreshed tokens onto the existing Account row (adapter won't).
      if (account?.provider === "google" && account.scope?.includes("gmail.readonly")) {
        await prisma.account.updateMany({
          where: { provider: "google", providerAccountId: account.providerAccountId },
          data: {
            access_token: account.access_token,
            expires_at: account.expires_at,
            scope: account.scope,
            // Google only returns a refresh_token with prompt=consent; don't clobber with undefined.
            ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
          },
        });
        // Mark the connection live; seed historyId lazily on first sync.
        if (user?.id) {
          // Re-consenting is the only thing that can heal a dead grant, so
          // clear the warning here rather than waiting for the next sync — and
          // on a real reconnect, drop the cursor so the next sync catches up.
          const update = connectionUpdateOnSignIn({
            hasFreshRefreshToken: Boolean(account.refresh_token),
          });
          await prisma.gmailConnection.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...update },
            update,
          });
        }
      }
      return true;
    },
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user;
}
