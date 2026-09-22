/**
 * The job-mail vocabulary: which Gmail searches find application email, and
 * which sender domains are shared platforms rather than employers.
 *
 * Gmail search reads bodies as well as headers, so these queries are both the
 * recall mechanism and the privacy gate — only what they return ever reaches
 * the model. Sourced from career-ops' gmail-sync procedure; when an
 * application slips through, add the missing sender or phrase here.
 */

/** Nothing before this is in scope for the tracker, even on a first sync. */
export const SYNC_FLOOR = new Date("2026-07-01T00:00:00Z");

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERLAP_DAYS = 2;
const FIRST_SYNC_DAYS = 30;
const SWEEP_CHUNK = 10;

/** Applicant-tracking systems that send on behalf of many employers. */
export const ATS_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com",
  // workday.com also covers {company}@otp.workday.com candidate-account mail.
  "myworkday.com", "workday.com", "icims.com", "smartrecruiters.com",
  "jobvite.com", "successfactors.com", "taleo.net",
  // JPMorgan's confirmation came from …mail.us2.cloud.oracle.com.
  "oraclecloud.com", "cloud.oracle.com", "eightfold.ai", "workable.com",
  "applytojob.com", "bamboohr.com", "teamtailor.com", "breezy.hr", "rippling.com",
] as const;

/** Online-assessment platforms: their mail names the employer, not the sender. */
export const ASSESSMENT_DOMAINS = [
  "codesignal.com", "hackerrank.com", "hackerrankforwork.com", "hirevue.com",
  "karat.com", "codility.com", "testgorilla.com", "coderpad.io", "byteboard.dev",
] as const;

export const WEBMAIL_DOMAINS = [
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com", "icloud.com",
] as const;

const GENERIC: readonly string[] = [...ATS_DOMAINS, ...ASSESSMENT_DOMAINS, ...WEBMAIL_DOMAINS];

/** True when a sender domain is shared infrastructure, not an employer. */
export function isGenericSenderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return GENERIC.some((g) => d === g || d.endsWith(`.${g}`));
}

const CONFIRMATION_PHRASES = [
  "thank you for applying", "thanks for applying", "application received",
  "received your application", "we received your application", "your application to",
  "application confirmation", "thank you for your interest",
];

const REJECTION_PHRASES = [
  "not moving forward", "move forward with other candidates", "pursue other candidates",
  "decided not to proceed", "not been selected", "regret to inform", "unable to offer",
  "your candidacy", "update on your application",
];

const INTERVIEW_TERMS = [
  "subject:interview", '"schedule a call"', '"phone screen"', '"next steps"',
  '"invite you to interview"', '"schedule your interview"',
];

const SWEEP_JOB_WORDS =
  '(application OR applied OR interview OR assessment OR candidate OR recruiter OR "next steps")';

const quoted = (phrases: string[]) => phrases.map((p) => `"${p}"`).join(" OR ");

function trackedCompanyTerms(companies: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const raw of companies) {
    const name = raw.replace(/"/g, "").replace(/\s+/g, " ").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    terms.push(`"${name}"`);
  }
  return terms;
}

export function buildSearchQueries(input: { after: Date; trackedCompanies: string[] }): string[] {
  const queries = [
    `from:(${ATS_DOMAINS.join(" OR ")})`,
    `(${quoted(CONFIRMATION_PHRASES)})`,
    `(${quoted(REJECTION_PHRASES)})`,
    `(${INTERVIEW_TERMS.join(" OR ")})`,
    `from:(${ASSESSMENT_DOMAINS.join(" OR ")})`,
    `subject:(assessment OR "coding challenge" OR "online assessment")`,
  ];

  // The job-word clause keeps consumer mail from tracked brands (Visa, Amex,
  // Amazon) out while still catching mid-pipeline mail sent from the
  // company's own domain, which no sender or phrase list would.
  const terms = trackedCompanyTerms(input.trackedCompanies);
  for (let i = 0; i < terms.length; i += SWEEP_CHUNK) {
    queries.push(`(${terms.slice(i, i + SWEEP_CHUNK).join(" OR ")}) ${SWEEP_JOB_WORDS}`);
  }

  const after = Math.floor(input.after.getTime() / 1000);
  return queries.map((q) => `${q} after:${after}`);
}

/**
 * Where a run's search window starts. The overlap absorbs Gmail indexing lag;
 * the EmailInsight ledger makes re-seeing a message free.
 */
export function syncWindowStart(lastSyncedAt: Date | null, now: Date): Date {
  const base = lastSyncedAt ?? new Date(now.getTime() - FIRST_SYNC_DAYS * DAY_MS);
  const start = new Date(base.getTime() - OVERLAP_DAYS * DAY_MS);
  return start < SYNC_FLOOR ? SYNC_FLOOR : start;
}
