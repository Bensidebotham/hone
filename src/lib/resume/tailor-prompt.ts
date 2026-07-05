import { z } from "zod";

export const TailoringResultSchema = z.object({
  fitScore: z.number().min(0).max(100),
  summary: z.string(),
  keywordGaps: z.array(z.string()),
  tailoredBullets: z.array(z.object({ original: z.string(), tailored: z.string() })),
  skillsToFeature: z.array(z.string()),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
});
export type TailoringResult = z.infer<typeof TailoringResultSchema>;

export function buildTailorPrompt(resumeText: string, jobDescription: string) {
  const system = [
    "You are an expert technical resume tailor and ATS specialist.",
    "Given a candidate's resume and a specific job description, tailor the resume to that job.",
    "Be specific, truthful, and ATS-aware. NEVER invent experience the resume does not contain —",
    'if the job needs something the resume lacks, put it in "gaps", never in "tailoredBullets".',
    "Return ONLY JSON matching this shape:",
    '{ "fitScore": number 0-100, "summary": string,',
    '  "keywordGaps": string[], "tailoredBullets": [ { "original": string, "tailored": string } ],',
    '  "skillsToFeature": string[], "strengths": string[], "gaps": string[] }',
    "fitScore = how well THIS resume matches THIS job.",
    "summary = a tailored professional-summary paragraph aimed at this role.",
    "tailoredBullets = rewrites of the resume's REAL bullets, emphasizing what this job values.",
    "keywordGaps = important job terms missing or weak in the resume.",
    "skillsToFeature = which of the candidate's skills to surface/reorder for this role.",
  ].join("\n");
  const prompt = `RESUME:\n${resumeText}\n\nJOB DESCRIPTION:\n${jobDescription}`;
  return { system, prompt };
}
