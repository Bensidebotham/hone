import { task } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { analyze } from "@/lib/ai/provider";
import { buildLinkedinPrompt, LinkedinAnalysisSchema } from "@/lib/profile/linkedin-prompt";

export const analyzeLinkedin = task({
  id: "analyze-linkedin",
  run: async ({ analysisId, profileText }: { analysisId: string; profileText: string }) => {
    try {
      const { system, prompt } = buildLinkedinPrompt(profileText);
      const parsed = LinkedinAnalysisSchema.parse(await analyze<unknown>({ system, prompt }));
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
