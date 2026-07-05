import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUser = vi.fn();
const rateLimit = vi.fn();
const generateTailoring = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...a: any) => requireUser(...a) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: any) => rateLimit(...a) }));
vi.mock("@/lib/demo/config", () => ({ isDemoEmail: (e: string) => e === "demo@hone.app" }));
vi.mock("@/lib/resume/tailor", async () => {
  class NoResumeError extends Error {}
  return { generateTailoring: (...a: any) => generateTailoring(...a), NoResumeError };
});

import { POST } from "./route";
import { NoResumeError } from "@/lib/resume/tailor";

const req = (body: unknown) => new Request("http://x/api/resume/tailor", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "u1", email: "real@x.com" });
  rateLimit.mockReturnValue({ ok: true, retryAfter: 0 });
});

it("403 for demo users", async () => {
  requireUser.mockResolvedValue({ id: "u1", email: "demo@hone.app" });
  const res = await POST(req({ jobDescription: "jd" }));
  expect(res.status).toBe(403);
});

it("429 when rate-limited", async () => {
  rateLimit.mockReturnValue({ ok: false, retryAfter: 30 });
  const res = await POST(req({ jobDescription: "jd" }));
  expect(res.status).toBe(429);
  expect(res.headers.get("Retry-After")).toBe("30");
});

it("400 on empty job description", async () => {
  const res = await POST(req({ jobDescription: "  " }));
  expect(res.status).toBe(400);
});

it("400 with code no_resume when the user has no résumé", async () => {
  generateTailoring.mockRejectedValue(new NoResumeError());
  const res = await POST(req({ jobDescription: "jd" }));
  expect(res.status).toBe(400);
  expect((await res.json()).code).toBe("no_resume");
});

it("returns the tailoring result on success", async () => {
  generateTailoring.mockResolvedValue({ id: "t1", fitScore: 80, summary: "s", keywordGaps: [], tailoredBullets: [], skillsToFeature: [], strengths: [], gaps: [] });
  const res = await POST(req({ jobDescription: "jd", applicationId: "a1" }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(expect.objectContaining({ id: "t1", fitScore: 80 }));
  expect(generateTailoring).toHaveBeenCalledWith({ userId: "u1", jobDescription: "jd", applicationId: "a1" });
});
