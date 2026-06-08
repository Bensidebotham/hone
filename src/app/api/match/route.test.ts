import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
const findResume = vi.fn().mockResolvedValue({ id: "r1", text: "React TypeScript" });
const findJob = vi.fn().mockResolvedValue({ id: "j1", descriptionText: "Need React" });
const upsert = vi.fn().mockResolvedValue({ id: "m1", score: 100 });
vi.mock("@/lib/db", () => ({ prisma: {
  resume: { findFirst: (...a: any) => findResume(...a) },
  job: { findFirst: (...a: any) => findJob(...a) },
  match: { upsert: (...a: any) => upsert(...a) },
} }));
import { POST } from "@/app/api/match/route";

describe("POST /api/match", () => {
  it("scores resume vs job and upserts a Match", async () => {
    const req = new Request("http://x", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId: "j1" }) });
    const res = await POST(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.score).toBe(100);
    expect(upsert).toHaveBeenCalled();
  });
  it("404 when user has no resume", async () => {
    findResume.mockResolvedValueOnce(null);
    const req = new Request("http://x", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: "j1" }) });
    expect((await POST(req)).status).toBe(404);
  });
});
