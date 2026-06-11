import type { AppStatus } from "@prisma/client";

export interface AppCandidate {
  applicationId: string;
  company: string;
  status: AppStatus;
}

export interface MatchResult {
  applicationId: string | null;
  currentStatus: AppStatus | null;
}

// ATS senders share a domain across many companies, so the domain root is not a
// company signal — only direct-company domains are.
const GENERIC_DOMAINS = new Set([
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com",
  "myworkday.com", "workday.com", "icims.com", "smartrecruiters.com",
  "bamboohr.com", "jobvite.com", "taleo.net", "successfactors.com",
  "breezy.hr", "workable.com", "applytojob.com", "rippling.com",
  "gmail.com", "googlemail.com", "outlook.com", "yahoo.com",
]);

function normalizeCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function senderCompanyToken(fromEmail: string): string | null {
  const match = fromEmail.match(/<([^>]+)>/);
  const addr = (match ? match[1] : fromEmail).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  const domain = addr.slice(at + 1);
  if (GENERIC_DOMAINS.has(domain)) return null;
  const label = domain.split(".")[0]; // "globex" from "globex.com"
  return label ? normalizeCompany(label) : null;
}

export function matchApplication(
  input: { fromEmail: string; company: string | null },
  candidates: AppCandidate[]
): MatchResult {
  const norm = candidates.map((c) => ({ ...c, key: normalizeCompany(c.company) }));

  // 1) Match on the classified company name (fuzzy on normalized form).
  if (input.company) {
    const target = normalizeCompany(input.company);
    if (target) {
      const hit = norm.find((c) => c.key === target || c.key.includes(target) || target.includes(c.key));
      if (hit) return { applicationId: hit.applicationId, currentStatus: hit.status };
    }
  }

  // 2) Fall back to a direct-company sender domain.
  const token = senderCompanyToken(input.fromEmail);
  if (token) {
    const hit = norm.find((c) => c.key === token || c.key.includes(token) || token.includes(c.key));
    if (hit) return { applicationId: hit.applicationId, currentStatus: hit.status };
  }

  return { applicationId: null, currentStatus: null };
}
