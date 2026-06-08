import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("@/lib/resume/extract", () => ({ extractText: vi.fn().mockResolvedValue("RESUME TEXT") }));
const create = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: {
  resume: { create: (...a: any) => create(...a) },
  analysis: { create: vi.fn().mockResolvedValue({ id: "a1" }) },
} }));
const trigger = vi.fn().mockResolvedValue({ id: "run1" });
vi.mock("@/trigger/analyze-resume", () => ({ analyzeResume: { trigger: (...a: any) => trigger(...a) } }));

import { POST } from "@/app/api/resume/upload/route";

describe("POST /api/resume/upload", () => {
  beforeEach(() => { create.mockResolvedValue({ id: "r1", text: "RESUME TEXT" }); });
  it("creates a resume + pending analysis and triggers the task", async () => {
    const file = new File([Buffer.from("x")], "cv.pdf", { type: "application/pdf" });
    const fd = new FormData(); fd.set("file", file);
    const req = new Request("http://x/api/resume/upload", { method: "POST", body: fd });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith({ analysisId: "a1", resumeText: "RESUME TEXT" });
  });
});
