// scripts/run-poll.ts
// Local one-off: run the same ingest as the poll-jobs Trigger task (current code),
// populating descriptionText/descriptionHtml + enrichment across all boards.
//   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/run-poll.ts
import { prisma } from "@/lib/db";
import { BOARDS } from "@/lib/jobs/boards.config";
import { fetchBoard } from "@/lib/jobs/fetchers";
import { enrichJob } from "@/lib/jobs/enrich";

async function main() {
  let upserts = 0;
  for (const cfg of BOARDS) {
    const jobs = await fetchBoard(cfg).catch(() => []);
    for (const j of jobs) {
      const e = enrichJob({
        title: j.title,
        location: j.location,
        descriptionText: j.descriptionText,
        salary: j.salary,
      });
      await prisma.job.upsert({
        where: { source_externalId: { source: "ats", externalId: j.externalId } },
        create: {
          source: "ats",
          externalId: j.externalId,
          company: j.company,
          title: j.title,
          location: j.location,
          url: j.url,
          descriptionText: j.descriptionText,
          descriptionHtml: j.descriptionHtml,
          postedAt: j.postedAt,
          salary: j.salary,
          country: e.country,
          isRemote: e.isRemote,
          roleCategory: e.roleCategory,
          level: e.level,
          techTags: e.techTags,
          salaryMin: e.salaryMin,
          salaryMax: e.salaryMax,
        },
        update: {
          title: j.title,
          location: j.location,
          url: j.url,
          descriptionText: j.descriptionText,
          descriptionHtml: j.descriptionHtml,
          postedAt: j.postedAt,
          salary: j.salary,
          country: e.country,
          isRemote: e.isRemote,
          roleCategory: e.roleCategory,
          level: e.level,
          techTags: e.techTags,
          salaryMin: e.salaryMin,
          salaryMax: e.salaryMax,
        },
      });
      upserts++;
    }
    console.log(`${cfg.company}: ${jobs.length} fetched (running total upserts ${upserts})`);
  }
  console.log(`Done. ${upserts} upserts.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
