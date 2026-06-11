// scripts/seed-applications.ts
//
// Seeds mock applications from a tracked CSV export of a job-search
// spreadsheet (scripts/seed/summer-2026.csv). Each row becomes a
// `paste`-source Job (run through the same enrichment as real ingest) plus a
// linked Application — mirroring createManualApplication() in
// src/lib/applications/actions.ts.
//
// Idempotent: every seeded job is tagged with an externalId of
// `seed:<DATASET>:<n>`, so re-running first deletes the prior seed (and only
// the seed — real manual applications are never touched).
//
//   pnpm seed                       # seeds for the first/only user
//   SEED_EMAIL=you@example.com pnpm seed
//
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { enrichJob, type EmploymentType } from "@/lib/jobs/enrich";

const DATASET = "summer-2026";
const CSV_PATH = join(process.cwd(), "scripts", "seed", `${DATASET}.csv`);

// --- Minimal RFC-4180 CSV parser (handles quoted fields with newlines) ---
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

type AppStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected";

function mapStatus(raw: string): AppStatus {
  const v = raw.trim().toLowerCase();
  if (v === "submitted - pending response") return "applied";
  if (v === "oa") return "interviewing"; // online assessment = in process
  if (v === "rejected") return "rejected";
  return "saved"; // "N/A" or blank → interested, not yet applied
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Split "Acme (New York, NY)" → { company: "Acme", location: "New York, NY" }. */
function splitCompany(raw: string): { company: string; location: string | null } {
  const pi = raw.indexOf("(");
  if (pi >= 0) {
    const company = clean(raw.slice(0, pi));
    const location = clean(raw.slice(pi + 1).replace(/\)\s*$/, "")) || null;
    return { company, location };
  }
  return { company: clean(raw), location: null };
}

function parseSheetDate(raw: string): Date | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
}

/** Deterministic date in the 2025 application season, so the table/sort look organic. */
function syntheticDate(index: number): Date {
  // Spread across Aug 25 – early Oct 2025.
  return new Date(2025, 7, 25 + ((index * 13) % 38), 9 + (index % 8), 0, 0);
}

function buildNotes(rejectionReason: string, notesCol: string): string | null {
  const parts: string[] = [];
  const rr = rejectionReason.trim();
  if (rr && rr.toUpperCase() !== "N/A") parts.push(`Rejection: ${rr}`);
  const n = clean(notesCol);
  if (n) parts.push(n);
  return parts.join("\n\n") || null;
}

async function main() {
  const email = process.env.SEED_EMAIL;
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    throw new Error(
      email
        ? `No user with email ${email}. Sign in once, then re-run.`
        : "No users in the database. Sign in once, then re-run."
    );
  }
  console.log(`Seeding for ${user.name ?? user.email ?? user.id}`);

  const rows = parseCSV(readFileSync(CSV_PATH, "utf8"));
  const data = rows.slice(1).filter((r) => (r[0] ?? "").trim().length > 0);
  console.log(`Parsed ${data.length} rows from ${CSV_PATH}`);

  // --- Idempotent reset: drop ONLY this dataset's prior seed ---
  const prior = await prisma.job.findMany({
    where: { userId: user.id, source: "paste", externalId: { startsWith: `seed:${DATASET}:` } },
    select: { id: true },
  });
  if (prior.length) {
    const ids = prior.map((j) => j.id);
    const delApps = await prisma.application.deleteMany({ where: { jobId: { in: ids } } });
    const delJobs = await prisma.job.deleteMany({ where: { id: { in: ids } } });
    console.log(`Reset prior seed: removed ${delApps.count} applications, ${delJobs.count} jobs`);
  }

  const tally: Record<AppStatus, number> = { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 };

  for (let i = 0; i < data.length; i++) {
    const [companyRaw = "", statusRaw = "", roleRaw = "", salaryRaw = "", dateRaw = "", urlRaw = "", rejRaw = "", notesRaw = ""] = data[i];

    const { company, location } = splitCompany(companyRaw);
    const title = clean(roleRaw) || "Software Engineer Intern";
    const status = mapStatus(statusRaw);
    const salary = clean(salaryRaw) || null;
    const url = urlRaw.trim() || null;
    const notes = buildNotes(rejRaw, notesRaw);

    const explicitDate = parseSheetDate(dateRaw);
    const appliedAt = status === "saved" ? null : explicitDate ?? syntheticDate(i);
    const createdAt = appliedAt ?? syntheticDate(i);

    const e = enrichJob({ title, location, descriptionText: "", salary });

    const job = await prisma.job.create({
      data: {
        userId: user.id,
        source: "paste",
        externalId: `seed:${DATASET}:${i}`,
        company,
        title,
        location,
        url,
        salary,
        descriptionText: "",
        createdAt,
        country: e.country,
        isRemote: e.isRemote,
        roleCategory: e.roleCategory,
        level: e.level,
        techTags: e.techTags,
        salaryMin: e.salaryMin,
        salaryMax: e.salaryMax,
        employmentType: e.employmentType satisfies EmploymentType,
      },
    });

    await prisma.application.create({
      data: { userId: user.id, jobId: job.id, status, notes, appliedAt, createdAt },
    });

    tally[status]++;
  }

  console.log("Done. Seeded applications by status:");
  for (const s of ["saved", "applied", "interviewing", "offer", "rejected"] as AppStatus[]) {
    console.log(`  ${s.padEnd(13)} ${tally[s]}`);
  }
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
