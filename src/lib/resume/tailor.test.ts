import { describe, it, expect, vi, beforeEach } from "vitest";

const resumeFindFirst = vi.fn();
const appFindFirst = vi.fn();
const tailoringCreate = vi.fn();
vi.mock("@/lib/db", () => ({
  prisma: {
    resume: { findFirst: (...a: any) => resumeFindFirst(...a) },
    application: { findFirst: (...a: any) => appFindFirst(...a) },
    tailoring: { create: (...a: any) => tailoringCreate(...a) },
  },
}));

import { generateTailoring, NoResumeError } from "./tailor";

const validModelJson = JSON.stringify({
  fitScore: 80, summary: "s", keywordGaps: ["k8s"],
  tailoredBullets: [{ original: "a", tailored: "b" }],
  skillsToFeature: ["Go"], strengths: ["x"], gaps: ["y"],
});
const fakeClient = { generateContent: vi.fn().mockResolvedValue({ text: validModelJson }) };

beforeEach(() => { vi.clearAllMocks(); fakeClient.generateContent.mockResolvedValue({ text: validModelJson }); });

it("throws NoResumeError when the user has no résumé", async () => {
  resumeFindFirst.mockResolvedValue(null);
  await expect(generateTailoring({ userId: "u1", jobDescription: "jd" }, { client: fakeClient }))
    .rejects.toBeInstanceOf(NoResumeError);
  expect(tailoringCreate).not.toHaveBeenCalled();
});

it("builds from the latest résumé, persists the tailoring, and returns the parsed result", async () => {
  resumeFindFirst.mockResolvedValue({ id: "r1", text: "RESUME" });
  tailoringCreate.mockResolvedValue({ id: "t1" });
  const out = await generateTailoring({ userId: "u1", jobDescription: "JD" }, { client: fakeClient });
  // résumé loaded scoped to user, newest first
  expect(resumeFindFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: "u1" }, orderBy: { createdAt: "desc" },
  }));
  // prompt reached the model with résumé + JD
  const sent = fakeClient.generateContent.mock.calls[0][0].contents as string;
  expect(sent).toContain("RESUME");
  expect(sent).toContain("JD");
  // persisted with snapshot + score
  expect(tailoringCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ userId: "u1", resumeId: "r1", jobDescription: "JD", fitScore: 80 }),
  }));
  expect(out).toEqual(expect.objectContaining({ id: "t1", fitScore: 80, summary: "s" }));
});

it("snapshots company/title/appId when a valid applicationId is given", async () => {
  resumeFindFirst.mockResolvedValue({ id: "r1", text: "R" });
  appFindFirst.mockResolvedValue({ id: "a1", company: "Stripe", title: "SWE" });
  tailoringCreate.mockResolvedValue({ id: "t1" });
  await generateTailoring({ userId: "u1", jobDescription: "JD", applicationId: "a1" }, { client: fakeClient });
  expect(tailoringCreate).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ applicationId: "a1", company: "Stripe", jobTitle: "SWE" }),
  }));
});

it("throws (and saves nothing) when the model returns malformed JSON", async () => {
  resumeFindFirst.mockResolvedValue({ id: "r1", text: "R" });
  fakeClient.generateContent.mockResolvedValue({ text: JSON.stringify({ fitScore: 999 }) });
  await expect(generateTailoring({ userId: "u1", jobDescription: "JD" }, { client: fakeClient })).rejects.toThrow();
  expect(tailoringCreate).not.toHaveBeenCalled();
});
