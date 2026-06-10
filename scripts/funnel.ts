// scripts/funnel.ts
// Diagnostic: how many jobs survive each stage of the default feed filter.
//   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/funnel.ts
import type { Prisma } from "@prisma/client";
import { prisma as p } from "@/lib/db";
const CS = ["frontend", "backend", "fullstack", "mobile", "ml-ai", "data", "devops", "security", "qa"];
async function main() {
  const total = await p.job.count();
  const base: Prisma.JobWhereInput = {
    source: { in: ["ats", "aggregator"] },
    active: true,
    roleCategory: { in: CS },
    OR: [{ country: "US" }, { AND: [{ isRemote: true }, { country: null }] }],
  };
  const newgradFT = await p.job.count({ where: { ...base, level: "junior", employmentType: "fulltime" } });
  const interns = await p.job.count({ where: { ...base, employmentType: "internship" } });
  const bySource = await p.job.groupBy({ by: ["source"], _count: true });
  console.log("TOTAL:", total);
  bySource.forEach((s) => console.log("  source", s.source, s._count));
  console.log("DEFAULT FEED (new-grad full-time):", newgradFT);
  console.log("Internships available:", interns);
}
main().finally(() => p.$disconnect());
