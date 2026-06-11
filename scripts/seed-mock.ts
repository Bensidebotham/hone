/**
 * Mock-data seed for landing-page screenshots.
 *
 * Replaces the current user's data with a generous, realistic dataset that
 * lights up every surface: the dashboard digest (Updates feed + New Jobs rail
 * + trend chart), the Jobs page, and the Applications table.
 *
 * Idempotent: re-running wipes Jobs / Applications / ApplicationEvents and
 * reseeds. Safe to run repeatedly.
 *
 *   npx tsx --tsconfig tsconfig.json --env-file=.env scripts/seed-mock.ts
 *
 * Targets the first user in the DB (or SEED_EMAIL if set). Does NOT touch
 * auth tables (User/Account/Session) — your login stays intact.
 */
import { prisma } from "../src/lib/db";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * HOUR);
const daysAgo = (d: number) => new Date(now - d * DAY);

const COMPANIES = [
  "Stripe", "Vercel", "Linear", "Ramp", "Notion", "Figma", "Datadog", "Airbnb",
  "Plaid", "Brex", "Retool", "Scale AI", "Coinbase", "Databricks", "Snowflake",
  "Cloudflare", "Asana", "Robinhood", "Instacart", "DoorDash", "Anthropic",
  "Discord", "Reddit", "Dropbox", "Block", "Affirm", "Gusto", "Rippling",
  "Mercury", "Webflow", "Vanta", "Sentry", "Render", "Supabase", "PlanetScale",
  "Temporal", "Modal", "Amplitude", "Segment", "Twilio", "Airtable", "Loom",
];

type RoleTemplate = { category: string; titles: string[]; tech: string[] };
const ROLES: RoleTemplate[] = [
  { category: "frontend", titles: ["Frontend Engineer, New Grad", "UI Engineer", "Frontend Engineer"], tech: ["TypeScript", "React", "Next.js", "CSS"] },
  { category: "backend", titles: ["Backend Engineer", "Software Engineer, Backend", "Backend Engineer, New Grad"], tech: ["Go", "PostgreSQL", "gRPC", "Redis"] },
  { category: "fullstack", titles: ["Software Engineer", "Full Stack Engineer", "Product Engineer", "Software Engineer, New Grad"], tech: ["TypeScript", "React", "Node.js", "PostgreSQL"] },
  { category: "mobile", titles: ["Mobile Engineer, iOS", "Android Engineer"], tech: ["Swift", "Kotlin", "React Native"] },
  { category: "ml-ai", titles: ["Machine Learning Engineer", "AI Engineer, New Grad"], tech: ["Python", "PyTorch", "CUDA"] },
  { category: "data", titles: ["Data Engineer", "Analytics Engineer"], tech: ["Python", "SQL", "dbt", "Spark"] },
  { category: "devops", titles: ["Platform Engineer", "Infrastructure Engineer"], tech: ["Terraform", "Kubernetes", "AWS", "Go"] },
  { category: "security", titles: ["Security Engineer, New Grad"], tech: ["Python", "Go", "AWS"] },
  { category: "qa", titles: ["Software Engineer in Test"], tech: ["TypeScript", "Playwright", "Python"] },
];

type Loc = { location: string; country: string | null; isRemote: boolean };
const LOCATIONS: Loc[] = [
  { location: "San Francisco, CA", country: "US", isRemote: false },
  { location: "New York, NY", country: "US", isRemote: false },
  { location: "Seattle, WA", country: "US", isRemote: false },
  { location: "Austin, TX", country: "US", isRemote: false },
  { location: "Boston, MA", country: "US", isRemote: false },
  { location: "Remote (US)", country: "US", isRemote: true },
  { location: "Remote", country: null, isRemote: true },
  { location: "Los Angeles, CA", country: "US", isRemote: false },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const desc = (title: string, company: string) =>
  `${company} is hiring a ${title}. Join a small, fast-moving team shipping product to millions of users. ` +
  `You'll own features end-to-end, partner closely with design and product, and grow fast. We value craft, ownership, and curiosity.`;

// Curated-pool fields shared by every job that should appear on the Jobs page
// and (when recent + unapplied) the New Jobs rail.
function curatedFields(i: number) {
  const role = ROLES[i % ROLES.length];
  const title = role.titles[i % role.titles.length];
  const company = COMPANIES[i % COMPANIES.length];
  const loc = LOCATIONS[i % LOCATIONS.length];
  const salaryMin = 120000 + (i % 4) * 10000; // 120k–150k
  const salaryMax = salaryMin + 40000 + (i % 3) * 15000; // +40k–70k
  return {
    company,
    title,
    location: loc.location,
    country: loc.country,
    isRemote: loc.isRemote,
    roleCategory: role.category,
    level: "junior",
    employmentType: "fulltime",
    techTags: role.tech,
    salaryMin,
    salaryMax,
    salary: `$${Math.round(salaryMin / 1000)}k–$${Math.round(salaryMax / 1000)}k`,
    url: `https://${slug(company)}.com/careers/${1000 + i}`,
    descriptionText: desc(title, company),
  };
}

async function main() {
  const email = process.env.SEED_EMAIL;
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user found to seed. Sign in once, then re-run.");
  const userId = user.id;
  console.log(`Seeding mock data for: ${user.email ?? userId}`);

  // ---- Reset (clean slate; single-user dev DB) ------------------------------
  await prisma.applicationEvent.deleteMany({ where: { userId } });
  await prisma.application.deleteMany({ where: { userId } });
  await prisma.userSavedJob.deleteMany({ where: { userId } });
  await prisma.job.deleteMany({}); // clears prior mock + any polled jobs
  await prisma.user.update({ where: { id: userId }, data: { lastDashboardVisitAt: null } });
  console.log("Cleared prior jobs / applications / events.");

  // ---- Open jobs: Jobs page + New Jobs rail ---------------------------------
  // 50 curated, UNAPPLIED jobs. First 8 posted in the last 24h so the rail is
  // full; the rest spread over ~3 weeks so the Jobs page looks active.
  const OPEN = 50;
  const openJobIds: string[] = [];
  for (let i = 0; i < OPEN; i++) {
    const postedAt = i < 8 ? hoursAgo(1 + i * 2) : daysAgo(1 + ((i - 8) % 21));
    const job = await prisma.job.create({
      data: {
        userId,
        source: "aggregator",
        externalId: `mock:open:${i}`,
        active: true,
        postedAt,
        createdAt: postedAt,
        ...curatedFields(i),
      },
      select: { id: true },
    });
    openJobIds.push(job.id);
  }
  console.log(`Created ${OPEN} open jobs (${"8"} in the last 24h for the rail).`);

  // ---- Applications across all statuses -------------------------------------
  // Each application gets its own "paste" job (so it lives in the tracker, not
  // the public Jobs feed) — mirrors how manually-added applications work.
  const STATUS_PLAN: Array<"saved" | "applied" | "interviewing" | "offer" | "rejected"> = [
    ...Array(6).fill("saved"),
    ...Array(10).fill("applied"),
    ...Array(7).fill("interviewing"),
    ...Array(2).fill("offer"),
    ...Array(5).fill("rejected"),
  ];

  const createdApps: Array<{ id: string; status: string; company: string }> = [];
  let appliedIdx = 0; // counter for spreading appliedAt across 10 weeks
  for (let i = 0; i < STATUS_PLAN.length; i++) {
    const status = STATUS_PLAN[i];
    const f = curatedFields(i + 100); // offset so companies/roles differ from open set
    const isSaved = status === "saved";
    const appliedAt = isSaved ? null : daysAgo(2 + appliedIdx * 3); // spread ~2–71 days
    if (!isSaved) appliedIdx++;
    const createdAt = appliedAt ?? daysAgo(1 + (i % 12));

    const job = await prisma.job.create({
      data: {
        userId,
        source: "paste",
        externalId: `mock:app:${i}`,
        active: true,
        postedAt: createdAt,
        createdAt,
        company: f.company,
        title: f.title,
        location: f.location,
        url: f.url,
        salary: f.salary,
        descriptionText: f.descriptionText,
        country: f.country,
        isRemote: f.isRemote,
        roleCategory: f.roleCategory,
        level: f.level,
        techTags: f.techTags,
        salaryMin: f.salaryMin,
        salaryMax: f.salaryMax,
        employmentType: f.employmentType,
      },
      select: { id: true },
    });

    const notes =
      status === "interviewing"
        ? "Recruiter screen done — technical round scheduled."
        : status === "offer"
          ? "Verbal offer received. Comp details pending."
          : status === "rejected"
            ? "Rejected after final round. Asked for feedback."
            : status === "applied"
              ? "Applied via referral. Following up next week."
              : "Looks promising — need to tailor my resume before applying.";

    const app = await prisma.application.create({
      data: { userId, jobId: job.id, status, notes, appliedAt, createdAt },
      select: { id: true },
    });
    createdApps.push({ id: app.id, status, company: f.company });

    // Historical "created" event (not shown in the 24h digest, kept for coherence).
    await prisma.applicationEvent.create({
      data: {
        applicationId: app.id,
        userId,
        type: "created",
        toStatus: "saved",
        summary: "Added to tracker",
        createdAt,
      },
    });
  }
  console.log(`Created ${STATUS_PLAN.length} applications across all statuses.`);

  // ---- Recent status-change events: the dashboard Updates feed ---------------
  const pick = (status: string, n: number) =>
    createdApps.filter((a) => a.status === status).slice(0, n);
  type RecentEvent = { app: { id: string; company: string }; fromStatus: string; toStatus: string; summary: string; createdAt: Date };
  const recent: RecentEvent[] = [];
  pick("interviewing", 3).forEach((a, idx) =>
    recent.push({ app: a, fromStatus: "applied", toStatus: "interviewing", summary: "Moved to Interviewing", createdAt: hoursAgo(2 + idx * 5) }));
  pick("offer", 1).forEach((a) =>
    recent.push({ app: a, fromStatus: "interviewing", toStatus: "offer", summary: "Moved to Offer", createdAt: hoursAgo(6) }));
  pick("applied", 2).forEach((a, idx) =>
    recent.push({ app: a, fromStatus: "saved", toStatus: "applied", summary: "Moved to Applied", createdAt: hoursAgo(9 + idx * 5) }));
  pick("rejected", 2).forEach((a, idx) =>
    recent.push({ app: a, fromStatus: "applied", toStatus: "rejected", summary: "Moved to Rejected", createdAt: hoursAgo(3 + idx * 8) }));

  for (const e of recent) {
    await prisma.applicationEvent.create({
      data: {
        applicationId: e.app.id,
        userId,
        type: "status_change",
        fromStatus: e.fromStatus as "saved" | "applied" | "interviewing" | "offer" | "rejected",
        toStatus: e.toStatus as "saved" | "applied" | "interviewing" | "offer" | "rejected",
        summary: e.summary,
        createdAt: e.createdAt,
      },
    });
  }
  console.log(`Created ${recent.length} recent updates for the digest feed.`);

  // ---- Profile + a few saved jobs -------------------------------------------
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, headline: "New-grad software engineer · full-stack · seeking 2026 roles" },
    update: { headline: "New-grad software engineer · full-stack · seeking 2026 roles" },
  });

  await prisma.userSavedJob.createMany({
    data: openJobIds.slice(10, 15).map((jobId, i) => ({ userId, jobId, savedAt: daysAgo(i + 1) })),
    skipDuplicates: true,
  });
  console.log("Set profile headline and saved 5 jobs.");

  // ---- Summary --------------------------------------------------------------
  const [jobs, apps, events] = await Promise.all([
    prisma.job.count(),
    prisma.application.count({ where: { userId } }),
    prisma.applicationEvent.count({ where: { userId } }),
  ]);
  console.log(`\nDone. Jobs: ${jobs} · Applications: ${apps} · Events: ${events}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
