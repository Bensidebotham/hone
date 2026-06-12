// Seed (or refresh) the public demo account with fabricated data.
// Safe to commit — the data is entirely fictional. Run with:
//
//   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/seed-demo.ts
//
// The app also self-seeds on the first "Try the demo" click, so this script is
// mainly for bootstrapping a fresh production database.
import { prisma } from "@/lib/db";
import { ensureDemoUser, reseedDemoData } from "@/lib/demo/seed";

async function main() {
  const user = await ensureDemoUser();
  await reseedDemoData(user.id);
  // Clear the visit stamp so the first dashboard view shows recent activity as new.
  await prisma.user.update({
    where: { id: user.id },
    data: { lastDashboardVisitAt: null },
  });
  console.log(`Demo account reseeded: ${user.email} (${user.id})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
