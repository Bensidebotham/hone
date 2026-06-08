import { z } from "zod";

export const ResumeAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  ats: z.object({ passes: z.boolean(), issues: z.array(z.string()) }),
  keywords: z.object({ present: z.array(z.string()), missing: z.array(z.string()) }),
  suggestions: z.array(
    z.object({
      priority: z.enum(["high", "medium", "low"]),
      text: z.string(),
    })
  ),
});
export type ResumeAnalysis = z.infer<typeof ResumeAnalysisSchema>;

export function buildResumePrompt(resumeText: string) {
  const system = [
    "You are an expert technical resume reviewer and ATS specialist.",
    "Return ONLY JSON matching this shape:",
    '{ "score": number 0-100, "ats": { "passes": boolean, "issues": string[] },',
    '"keywords": { "present": string[], "missing": string[] },',
    '"suggestions": [ { "priority": "high|medium|low", "text": string } ] }',
    "Score reflects overall strength. Be specific and actionable.",
  ].join("\n");
  const prompt = `Analyze this resume:\n\n${resumeText}`;
  return { system, prompt };
}
