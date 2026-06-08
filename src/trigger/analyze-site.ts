import { task } from "@trigger.dev/sdk";
import { prisma } from "@/lib/db";
import { analyze } from "@/lib/ai/provider";
import { fetchSiteText } from "@/lib/profile/fetch-site";
import { buildSitePrompt, SiteAnalysisSchema } from "@/lib/profile/site-prompt";

export const analyzeSite = task({
  id: "analyze-site",
  run: async ({ analysisId, url }: { analysisId: string; url: string }) => {
    try {
      const text = await fetchSiteText(url); // guarded: blocklist + SSRF + timeout
      const { system, prompt } = buildSitePrompt(text);
      const parsed = SiteAnalysisSchema.parse(await analyze<unknown>({ system, prompt }));
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
