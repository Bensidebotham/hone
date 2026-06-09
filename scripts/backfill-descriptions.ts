// scripts/backfill-descriptions.ts
// Recover descriptionText (clean plain) + descriptionHtml (sanitized) from the
// already-stored descriptionText. Idempotent. Run:
//   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/backfill-descriptions.ts
import { prisma } from "@/lib/db";
import { cleanDescription } from "@/lib/jobs/description";

async function main() {
  const batchSize = 200;
  let processed = 0;
  let cursor: string | undefined;
  for (;;) {
    const jobs = await prisma.job.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, descriptionText: true },
    });
    if (jobs.length === 0) break;
    for (const j of jobs) {
      const { text, html } = cleanDescription(j.descriptionText);
      await prisma.job.update({
        where: { id: j.id },
        data: { descriptionText: text, descriptionHtml: html },
      });
      processed++;
    }
    cursor = jobs[jobs.length - 1].id;
    console.log(`Backfilled ${processed}…`);
  }
  console.log(`Done. ${processed} descriptions recovered.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
