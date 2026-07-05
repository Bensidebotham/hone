import { prisma } from "@/lib/db";
import { analyze, type ModelLike } from "@/lib/ai/provider";
import { buildTailorPrompt, TailoringResultSchema, type TailoringResult } from "./tailor-prompt";

export class NoResumeError extends Error {
  constructor() {
    super("No résumé found. Upload a résumé first.");
    this.name = "NoResumeError";
  }
}

export interface GenerateTailoringInput {
  userId: string;
  jobDescription: string;
  applicationId?: string;
}

export async function generateTailoring(
  input: GenerateTailoringInput,
  opts: { client?: ModelLike } = {}
): Promise<{ id: string } & TailoringResult> {
  const resume = await prisma.resume.findFirst({
    where: { userId: input.userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, text: true },
  });
  if (!resume) throw new NoResumeError();

  let applicationId: string | null = null;
  let company: string | null = null;
  let jobTitle: string | null = null;
  if (input.applicationId) {
    const app = await prisma.application.findFirst({
      where: { id: input.applicationId, userId: input.userId },
      select: { id: true, company: true, title: true },
    });
    if (app) { applicationId = app.id; company = app.company; jobTitle = app.title; }
  }

  const { system, prompt } = buildTailorPrompt(resume.text, input.jobDescription);
  const raw = await analyze<unknown>({ system, prompt }, opts);
  const result = TailoringResultSchema.parse(raw);

  const row = await prisma.tailoring.create({
    data: {
      userId: input.userId,
      resumeId: resume.id,
      applicationId,
      company,
      jobTitle,
      jobDescription: input.jobDescription,
      fitScore: result.fitScore,
      result: result as object,
    },
    select: { id: true },
  });

  return { id: row.id, ...result };
}
