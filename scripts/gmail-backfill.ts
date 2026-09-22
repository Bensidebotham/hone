// Rewind a user's Gmail sync so the hourly task re-scans from a date. Run with:
//
//   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/gmail-backfill.ts <email> [YYYY-MM-DD]
//
// The date defaults to 2026-07-01 (SYNC_FLOOR). lastSyncedAt is set 2 days
// later because each run already overlaps the last sync by 2 days. Already
// processed mail is skipped via the EmailInsight ledger, so this is safe to
// re-run.
import { prisma } from "@/lib/db";
import { SYNC_FLOOR } from "@/lib/gmail/queries";

async function main() {
  const [email, since] = process.argv.slice(2);
  if (!email) throw new Error("usage: gmail-backfill.ts <email> [YYYY-MM-DD]");
  const from = since ? new Date(`${since}T00:00:00Z`) : SYNC_FLOOR;
  if (Number.isNaN(from.getTime())) throw new Error(`bad date: ${since}`);

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`no user ${email}`);

  const lastSyncedAt = new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);
  await prisma.gmailConnection.update({ where: { userId: user.id }, data: { lastSyncedAt } });
  console.log(`Gmail sync for ${email} rewound: next run scans from ${from.toISOString().slice(0, 10)}`);
}

main().finally(() => prisma.$disconnect());
