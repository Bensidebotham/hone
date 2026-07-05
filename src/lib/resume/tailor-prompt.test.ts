import { describe, it, expect } from "vitest";
import { TailoringResultSchema, buildTailorPrompt } from "./tailor-prompt";

const valid = {
  fitScore: 78, summary: "Backend engineer…",
  keywordGaps: ["Kubernetes"], tailoredBullets: [{ original: "Built API", tailored: "Designed gRPC service" }],
  skillsToFeature: ["Go"], strengths: ["backend depth"], gaps: ["no k8s"],
};

describe("TailoringResultSchema", () => {
  it("accepts a well-formed result", () => {
    expect(TailoringResultSchema.parse(valid)).toEqual(valid);
  });
  it("rejects a missing fitScore", () => {
    const { fitScore, ...rest } = valid;
    expect(() => TailoringResultSchema.parse(rest)).toThrow();
  });
  it("rejects a fitScore out of 0–100", () => {
    expect(() => TailoringResultSchema.parse({ ...valid, fitScore: 140 })).toThrow();
  });
  it("rejects a tailoredBullet missing 'tailored'", () => {
    expect(() => TailoringResultSchema.parse({ ...valid, tailoredBullets: [{ original: "x" }] })).toThrow();
  });
});

describe("buildTailorPrompt", () => {
  it("includes the résumé text and the job description", () => {
    const { system, prompt } = buildTailorPrompt("RESUME_TEXT_HERE", "JD_TEXT_HERE");
    expect(prompt).toContain("RESUME_TEXT_HERE");
    expect(prompt).toContain("JD_TEXT_HERE");
    expect(system.toLowerCase()).toContain("json");
    // Must instruct the model not to fabricate experience.
    expect(system.toLowerCase()).toContain("gaps");
  });
});
