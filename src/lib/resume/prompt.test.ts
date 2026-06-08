import { describe, it, expect } from "vitest";
import { buildResumePrompt, ResumeAnalysisSchema } from "@/lib/resume/prompt";

describe("buildResumePrompt", () => {
  it("includes resume text and asks for JSON shape", () => {
    const { system, prompt } = buildResumePrompt("JANE DOE\nEngineer");
    expect(prompt).toContain("JANE DOE");
    expect(system).toMatch(/ATS/i);
    expect(system).toMatch(/score/i);
  });
  it("schema validates a well-formed result", () => {
    const ok = ResumeAnalysisSchema.safeParse({
      score: 72,
      ats: { passes: true, issues: ["no headings"] },
      keywords: { present: ["react"], missing: ["graphql"] },
      suggestions: [{ priority: "high", text: "Quantify impact" }],
    });
    expect(ok.success).toBe(true);
  });
});
