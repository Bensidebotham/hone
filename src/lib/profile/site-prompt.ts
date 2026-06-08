import { z } from "zod";

export const SiteAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  dimensions: z.object({
    professionalism: z.number(),
    projectShowcase: z.number(),
    technical: z.number(),
    ux: z.number(),
  }),
  suggestions: z.array(
    z.object({
      priority: z.enum(["high", "medium", "low"]),
      text: z.string(),
    })
  ),
});

export type SiteAnalysis = z.infer<typeof SiteAnalysisSchema>;

export function buildSitePrompt(siteText: string): {
  system: string;
  prompt: string;
} {
  const system = [
    "You are a portfolio/personal-site reviewer for software engineers.",
    "Rate professionalism, project showcase, technical signal, and UX (each 0-100).",
    "Return ONLY JSON:",
    '{ "score": 0-100, "dimensions": { "professionalism": number, "projectShowcase": number,',
    '"technical": number, "ux": number }, "suggestions": [ { "priority": "high|medium|low", "text": string } ] }',
  ].join("\n");

  return { system, prompt: `Personal site content:\n\n${siteText}` };
}
