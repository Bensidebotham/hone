// scripts/backfill-enrichment.ts
// One-off, idempotent: re-enrich every existing Job. Run with:
//   npx tsx scripts/backfill-enrichment.ts
import { prisma } from "@/lib/db";
import { enrichJob } from "@/lib/jobs/enrich";

async function main() {
  const batchSize = 200;
  let processed = 0;
  let cursor: string | undefined;

  for (;;) {
    const jobs = await prisma.job.findMany({
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, title: true, location: true, descriptionText: true, salary: true },
    });
    if (jobs.length === 0) break;

    for (const j of jobs) {
      const e = enrichJob({
        title: j.title,
        location: j.location,
        descriptionText: j.descriptionText,
        salary: j.salary,
      });
      await prisma.job.update({
        where: { id: j.id },
        data: {
          country: e.country,
          isRemote: e.isRemote,
          roleCategory: e.roleCategory,
          level: e.level,
          techTags: e.techTags,
          salaryMin: e.salaryMin,
          salaryMax: e.salaryMax,
        },
      });
      processed++;
    }
    cursor = jobs[jobs.length - 1].id;
    console.log(`Backfilled ${processed} jobs…`);
  }

  console.log(`Done. ${processed} jobs enriched.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
