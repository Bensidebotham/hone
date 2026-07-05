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
    // Stub the request's formData() with a duck-typed file. The route reads
    // `arrayBuffer`/`name`/`type` (it deliberately avoids `instanceof File`),
    // so this exercises its real logic without the jsdom↔undici File-class
    // mismatch that a real File/FormData/Request triggers in the test env.
    const fileLike = {
      name: "cv.pdf",
      type: "application/pdf",
      arrayBuffer: async () => new TextEncoder().encode("x").buffer,
    };
    const req = {
      formData: async () => ({ get: (k: string) => (k === "file" ? fileLike : null) }),
    } as unknown as Request;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalled();
    expect(trigger).toHaveBeenCalledWith({ analysisId: "a1", resumeText: "RESUME TEXT" });
  });
});
