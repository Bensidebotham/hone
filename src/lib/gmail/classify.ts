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
}

export function buildClassifyPrompt(email: EmailForClassify): { system: string; prompt: string } {
  const system = [
    "You classify a single job-search email into the applicant's application status.",
    'Return ONLY JSON: {"status","confidence","company","title","reason"}.',
    `status is one of: ${EMAIL_STATUSES.join(", ")}.`,
    "- applied: confirmation that an application was received.",
    "- interviewing: an interview invite, scheduling, recruiter screen, or assessment.",
    "- offer: a job offer is extended.",
    "- rejected: the candidate is declined / not moving forward.",
    "- none: not about the applicant's own application status (newsletter, job alert, marketing).",
    "confidence is 0..1 (how sure you are of the status).",
    "company and title: the hiring company and role if identifiable, else null.",
    "reason: one short sentence of justification.",
  ].join("\n");

  const prompt = [
    `From: ${email.from}`,
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
