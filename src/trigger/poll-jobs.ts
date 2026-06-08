import { schedules } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { BOARDS } from "@/lib/jobs/boards.config";
import { fetchBoard } from "@/lib/jobs/fetchers";

export const pollJobs = schedules.task({
  id: "poll-jobs",
  cron: "0 * * * *", // hourly
  run: async () => {
    let upserts = 0;
    for (const cfg of BOARDS) {
      const jobs = await fetchBoard(cfg).catch(() => []);
      for (const j of jobs) {
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
            postedAt: j.postedAt,
            salary: j.salary,
          },
          update: {
            title: j.title,
            location: j.location,
            url: j.url,
            descriptionText: j.descriptionText,
            postedAt: j.postedAt,
            salary: j.salary,
          },
        });
        upserts++;
      }
    }
    return { upserts };
  },
});
