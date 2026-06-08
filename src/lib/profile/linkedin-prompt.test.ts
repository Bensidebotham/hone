import { describe, it, expect } from "vitest";
import { buildLinkedinPrompt, LinkedinAnalysisSchema } from "@/lib/profile/linkedin-prompt";

describe("linkedin prompt", () => {
  it("embeds profile text and asks for sections", () => {
    const { system, prompt } = buildLinkedinPrompt("Headline: Engineer");
    expect(prompt).toContain("Headline: Engineer");
    expect(system).toMatch(/headline/i);
  });
  it("schema validates", () => {
    expect(
      LinkedinAnalysisSchema.safeParse({
        score: 65,
        sections: { headline: "weak", about: "ok", experience: "strong" },
        suggestions: [{ priority: "high", text: "Add metrics" }],
      }).success
    ).toBe(true);
  });
});
