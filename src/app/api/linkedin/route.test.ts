import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
const createA = vi.fn().mockResolvedValue({ id: "a1" });
vi.mock("@/lib/db", () => ({ prisma: { analysis: { create: (...a: any) => createA(...a) } } }));
const trig = vi.fn().mockResolvedValue({ id: "run1" });
vi.mock("@/trigger/analyze-linkedin", () => ({ analyzeLinkedin: { trigger: (...a: any) => trig(...a) } }));
import { POST } from "@/app/api/linkedin/route";

describe("POST /api/linkedin", () => {
  it("creates a pending linkedin analysis and triggers", async () => {
    const profileText = "Headline: Senior Engineer with 8 years building web apps";
    const req = new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileText }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(createA).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "u1", type: "linkedin", status: "pending" }) }));
    expect(trig).toHaveBeenCalledWith({ analysisId: "a1", profileText });
  });
  it("rejects too-short text", async () => {
    const req = new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profileText: "short" }) });
    expect((await POST(req)).status).toBe(400);
  });
});
