import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Trust the deployment host (Vercel sets X-Forwarded-Host). Without this,
  // Auth.js v5 in production rejects the host (UntrustedHost) and diverts
  // protected routes to its own sign-in page instead of honoring requireUser().
  trustHost: true,
  session: { strategy: "database" },
  providers: [Google],
  callbacks: {
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
