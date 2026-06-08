import { task } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { analyze } from "@/lib/ai/provider";
import { buildResumePrompt, ResumeAnalysisSchema, type ResumeAnalysis } from "@/lib/resume/prompt";

export const analyzeResume = task({
  id: "analyze-resume",
  run: async ({ analysisId, resumeText }: { analysisId: string; resumeText: string }) => {
    try {
      const { system, prompt } = buildResumePrompt(resumeText);
      const raw = await analyze<unknown>({ system, prompt });
      const parsed: ResumeAnalysis = ResumeAnalysisSchema.parse(raw);
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { status: "complete", score: parsed.score, result: parsed as object },
      });
    } catch (e) {
      await prisma.analysis.update({
        where: { id: analysisId },
        data: { status: "failed", error: (e as Error).message },
      });
      throw e;
    }
  },
});
