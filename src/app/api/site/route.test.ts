import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
const createA = vi.fn().mockResolvedValue({ id: "a2" });
vi.mock("@/lib/db", () => ({ prisma: { analysis: { create: (...a: any) => createA(...a) } } }));
const trigS = vi.fn().mockResolvedValue({ id: "run2" });
vi.mock("@/trigger/analyze-site", () => ({ analyzeSite: { trigger: (...a: any) => trigS(...a) } }));
import { POST } from "@/app/api/site/route";

describe("POST /api/site", () => {
  it("creates a pending site analysis and triggers for a normal url", async () => {
    const url = "https://myportfolio.dev";
    const req = new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(createA).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "u1", type: "site", status: "pending", sourceUrl: url }) }));
    expect(trigS).toHaveBeenCalledWith({ analysisId: "a2", url });
  });
  it("rejects an invalid url with 400", async () => {
    const req = new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "not-a-url" }) });
    expect((await POST(req)).status).toBe(400);
    expect(trigS).not.toHaveBeenCalled();
  });
  it("rejects a blocklisted domain (LinkedIn) with 400 and never triggers", async () => {
    const req = new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://www.linkedin.com/in/someone" }) });
    expect((await POST(req)).status).toBe(400);
    expect(trigS).not.toHaveBeenCalled();
  });
});
