import type { AppStatus } from "@prisma/client";
import { isGenericSenderDomain } from "@/lib/gmail/queries";

/** A tracked application. Callers pass these newest-created first. */
export interface AppCandidate {
  applicationId: string;
  company: string;
  title: string;
  status: AppStatus;
}

export interface MatchResult {
  applicationId: string | null;
  currentStatus: AppStatus | null;
}

/** Below this length, containment is too loose ("meta" ⊂ "metabase"). */
const MIN_CONTAIN_LEN = 5;

function normalizeCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function sameCompany(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= MIN_CONTAIN_LEN && long.includes(short);
}

/** "email.roblox.com" → "roblox"; "careers.acme.co.uk" → "acme". */
function registrableLabel(domain: string): string | undefined {
  const parts = domain.split(".");
  const n = parts.length;
  const twoLevelTld = n >= 3 && parts[n - 1].length === 2 && parts[n - 2].length <= 3;
  return twoLevelTld ? parts[n - 3] : parts[n - 2];
}

function senderCompanyToken(fromEmail: string): string | null {
  const match = fromEmail.match(/<([^>]+)>/);
  const addr = (match ? match[1] : fromEmail).trim().toLowerCase();
  const at = addr.lastIndexOf("@");
  if (at === -1) return null;
  const domain = addr.slice(at + 1);
  // Shared senders (ATS, assessment vendors, webmail) say nothing about the employer.
  if (isGenericSenderDomain(domain)) return null;
  const label = registrableLabel(domain);
  return label ? normalizeCompany(label) : null;
}

function titleWords(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
}

/** Among same-company apps, the one sharing the most title words; ties keep list order. */
function pickByTitle(hits: AppCandidate[], title: string | null | undefined): AppCandidate {
  if (!title || hits.length === 1) return hits[0];
  const want = titleWords(title);
  let best = hits[0];
  let bestScore = -1;
  for (const h of hits) {
    const score = [...titleWords(h.title)].filter((w) => want.has(w)).length;
    if (score > bestScore) { best = h; bestScore = score; }
  }
  return best;
}

export function matchApplication(
  input: { fromEmail: string; company: string | null; title?: string | null },
  candidates: AppCandidate[]
): MatchResult {
  const keyed = candidates.map((c) => ({ c, key: normalizeCompany(c.company) }));

  const find = (target: string | null): AppCandidate[] =>
    target ? keyed.filter((k) => sameCompany(k.key, target)).map((k) => k.c) : [];

  // 1) The classified company name; 2) a direct-company sender domain.
  let hits = find(input.company ? normalizeCompany(input.company) : null);
  if (hits.length === 0) hits = find(senderCompanyToken(input.fromEmail));
  if (hits.length === 0) return { applicationId: null, currentStatus: null };

  const hit = pickByTitle(hits, input.title);
  return { applicationId: hit.applicationId, currentStatus: hit.status };
}
