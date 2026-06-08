import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
const create = vi.fn().mockResolvedValue({ id: "j1" });
vi.mock("@/lib/db", () => ({ prisma: { job: { create: (...a: any) => create(...a) } } }));
import { POST } from "@/app/api/jobs/paste/route";

describe("POST /api/jobs/paste", () => {
  it("creates a user-owned pasted job", async () => {
    const req = new Request("http://x", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ company: "Acme", title: "SWE", descriptionText: "Build" }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "u1", source: "paste", company: "Acme" }),
    }));
  });
  it("rejects missing fields", async () => {
    const req = new Request("http://x", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ company: "Acme" }) });
    expect((await POST(req)).status).toBe(400);
  });
});
