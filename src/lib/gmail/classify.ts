import { z } from "zod";
import { analyze, type ModelLike } from "@/lib/ai/provider";

export const EMAIL_STATUSES = ["applied", "interviewing", "offer", "rejected", "none"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const ClassificationSchema = z.object({
  status: z.enum(EMAIL_STATUSES),
  confidence: z.number().min(0).max(1),
  company: z.string().nullable(),
  title: z.string().nullable(),
  reason: z.string(),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export interface EmailForClassify {
  from: string;
  subject: string;
  body: string;
  receivedAt?: Date;
}

export function buildClassifyPrompt(email: EmailForClassify): { system: string; prompt: string } {
  const system = [
    "You classify a single email about the recipient's own job applications.",
    'Return ONLY JSON: {"status","confidence","company","title","reason"}.',
    `status is one of: ${EMAIL_STATUSES.join(", ")}.`,
    "- applied: confirmation that an application the recipient submitted was received.",
    "- interviewing: an interview invite or scheduling, a recruiter screen, or an online assessment / coding challenge invitation or reminder (CodeSignal, HackerRank, HireVue, etc.) — assessments count as interviewing.",
    "- offer: a job offer is extended.",
    "- rejected: the candidate is declined / not moving forward.",
    "- none: anything else. This includes job ads and \"position now available\" / \"we're hiring\" mail, job-alert digests and recommended-jobs mail, LinkedIn / Indeed / Handshake notifications, recruiter cold outreach about a role the recipient did not apply to, newsletters and marketing.",
    "confidence is 0..1: how sure you are that this concerns an application the recipient actually submitted AND of the status.",
    "company: the hiring company (not the ATS or assessment vendor), else null.",
    "title: the role; take it from the subject line if the body does not name it; null only if neither does.",
    "reason: one short sentence of justification.",
  ].join("\n");

  const prompt = [
    `From: ${email.from}`,
    ...(email.receivedAt ? [`Date: ${email.receivedAt.toISOString().slice(0, 10)}`] : []),
    `Subject: ${email.subject}`,
    "Body:",
    email.body.slice(0, 2000),
  ].join("\n");

  return { system, prompt };
}

export async function classifyEmail(
  email: EmailForClassify,
  opts: { client?: ModelLike } = {}
): Promise<Classification> {
  const { system, prompt } = buildClassifyPrompt(email);
  const raw = await analyze<unknown>({ system, prompt }, opts);
  return ClassificationSchema.parse(raw);
}
