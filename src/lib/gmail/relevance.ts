// Pure heuristic gate: decides whether an email is plausibly job-search related
// BEFORE any model call. Non-relevant mail is never sent to Gemini or stored.

const ATS_DOMAINS = [
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "ashbyhq.com",
  "myworkday.com", "workday.com", "icims.com", "smartrecruiters.com",
  "bamboohr.com", "jobvite.com", "taleo.net", "successfactors.com",
  "breezy.hr", "workable.com", "applytojob.com", "rippling.com",
];

const SUBJECT_KEYWORDS = [
  "application", "applied", "interview", "candidate", "candidacy",
  "position", "the role", "your offer", "unfortunately", "next step",
  "moving forward", "thank you for applying", "status of your",
  "recruiter", "phone screen", "assessment",
];

/** Extract the bare email address from a possibly display-name-wrapped From header. */
function extractAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

function domainOf(from: string): string {
  const addr = extractAddress(from);
  const at = addr.lastIndexOf("@");
  return at === -1 ? "" : addr.slice(at + 1);
}

export function isJobRelevant(input: { fromEmail: string; subject: string }): boolean {
  const domain = domainOf(input.fromEmail);
  if (ATS_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;

  const subject = (input.subject ?? "").toLowerCase();
  return SUBJECT_KEYWORDS.some((kw) => subject.includes(kw));
}
