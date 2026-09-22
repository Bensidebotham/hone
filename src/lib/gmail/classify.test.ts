import { describe, it, expect, vi } from "vitest";
import {
  buildClassifyPrompt,
  ClassificationSchema,
  classifyEmail,
} from "@/lib/gmail/classify";

describe("buildClassifyPrompt", () => {
  it("includes the email fields and asks for the JSON shape", () => {
    const { system, prompt } = buildClassifyPrompt({
      from: "no-reply@greenhouse.io",
      subject: "Acme — application received",
      body: "Thanks for applying to the Software Engineer role.",
    });
    expect(prompt).toContain("Acme — application received");
    expect(prompt).toContain("Software Engineer");
    expect(system).toMatch(/status/i);
    expect(system).toMatch(/confidence/i);
  });

  it("tells the model what is NOT an application email", () => {
    const { system } = buildClassifyPrompt({ from: "a@b.com", subject: "s", body: "b" });
    expect(system).toMatch(/job ads/i);
    expect(system).toMatch(/job-alert/i);
    expect(system).toMatch(/LinkedIn/);
    expect(system).toMatch(/cold outreach/i);
  });

  it("routes online assessments to interviewing and titles from the subject", () => {
    const { system } = buildClassifyPrompt({ from: "a@b.com", subject: "s", body: "b" });
    expect(system).toMatch(/assessment[^\n]*interviewing/i);
    expect(system).toMatch(/title[^\n]*subject/i);
  });

  it("includes the received date when known", () => {
    const { prompt } = buildClassifyPrompt({
      from: "a@b.com", subject: "s", body: "b", receivedAt: new Date("2026-09-10T15:00:00Z"),
    });
    expect(prompt).toContain("Date: 2026-09-10");
  });
});

describe("ClassificationSchema", () => {
  it("accepts a well-formed classification", () => {
    const ok = ClassificationSchema.safeParse({
      status: "rejected", confidence: 0.91, company: "Acme", title: "SWE", reason: "says unfortunately",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects an out-of-range confidence", () => {
    expect(ClassificationSchema.safeParse({
      status: "applied", confidence: 1.4, company: null, title: null, reason: "x",
    }).success).toBe(false);
  });
  it("rejects an unknown status", () => {
    expect(ClassificationSchema.safeParse({
      status: "ghosted", confidence: 0.5, company: null, title: null, reason: "x",
    }).success).toBe(false);
  });
});

describe("classifyEmail", () => {
  it("returns the validated classification from the model", async () => {
    const client = {
      generateContent: vi.fn().mockResolvedValue({
        text: '{"status":"interviewing","confidence":0.86,"company":"Acme","title":"SWE","reason":"invites to schedule"}',
      }),
    };
    const out = await classifyEmail(
      { from: "x@acme.com", subject: "Interview", body: "Let's schedule" },
      { client }
    );
    expect(out.status).toBe("interviewing");
    expect(out.confidence).toBeCloseTo(0.86);
  });
});
