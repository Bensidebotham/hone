import { z } from "zod";

export const LinkedinAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  sections: z.object({
    headline: z.string(),
    about: z.string(),
    experience: z.string(),
  }),
  suggestions: z.array(
    z.object({
      priority: z.enum(["high", "medium", "low"]),
      text: z.string(),
    })
  ),
});

export type LinkedinAnalysis = z.infer<typeof LinkedinAnalysisSchema>;

export function buildLinkedinPrompt(profileText: string): {
  system: string;
  prompt: string;
} {
  const system = [
    "You are a LinkedIn profile optimization expert.",
    "Critique the headline, about, and experience sections.",
    "Return ONLY JSON:",
    '{ "score": 0-100, "sections": { "headline": string, "about": string, "experience": string },',
    '"suggestions": [ { "priority": "high|medium|low", "text": string } ] }',
  ].join("\n");

  return { system, prompt: `LinkedIn profile:\n\n${profileText}` };
}
