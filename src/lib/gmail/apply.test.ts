import { describe, it, expect, vi, beforeEach } from "vitest";

const insightFind = vi.fn();
const insightCreate = vi.fn().mockResolvedValue({});
const appUpdate = vi.fn().mockResolvedValue({});
const txAppCreate = vi.fn();
const txEventCreate = vi.fn().mockResolvedValue({});
const txInsightCreate = vi.fn().mockResolvedValue({});
const recordEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  prisma: {
    emailInsight: { findUnique: (...a: any) => insightFind(...a), create: (...a: any) => insightCreate(...a) },
    application: { update: (...a: any) => appUpdate(...a) },
    $transaction: (fn: any) => fn({
      application: { create: (...a: any) => txAppCreate(...a) },
      applicationEvent: { create: (...a: any) => txEventCreate(...a) },
      emailInsight: { create: (...a: any) => txInsightCreate(...a) },
    }),
  },
}));
vi.mock("@/lib/applications/events", () => ({ recordApplicationEvent: (...a: any) => recordEvent(...a) }));

import { applyDecision, type IncomingEmail } from "@/lib/gmail/apply";

const email: IncomingEmail = {
  messageId: "m1", threadId: "t1", fromEmail: "no-reply@ashbyhq.com",
  subject: "Thanks for applying to Valon", snippet: "s", confidence: 0.9,
  receivedAt: new Date("2026-09-02T10:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  insightFind.mockResolvedValue(null);
  txAppCreate.mockResolvedValue({ id: "new-app", company: "Valon", title: "Role not specified", status: "applied" });
});

describe("applyDecision — create", () => {
  it("creates the application, a created event and a linked auto_applied insight", async () => {
    const res = await applyDecision("u1", email, { action: "create", status: "applied", company: "Valon", title: null });

    expect(txAppCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1", company: "Valon", title: "Role not specified", status: "applied",
        appliedAt: email.receivedAt, source: "Email",
      },
    });
    expect(txEventCreate).toHaveBeenCalledWith({
      data: { applicationId: "new-app", userId: "u1", type: "created", toStatus: "applied", summary: "Added from email" },
    });
    expect(txInsightCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        messageId: "m1", kind: "new_application", outcome: "auto_applied",
        applicationId: "new-app", company: "Valon", title: null, suggestedStatus: "applied",
      }),
    });
    expect(res).toEqual({
      wrote: true,
      created: { applicationId: "new-app", company: "Valon", title: "Role not specified", status: "applied" },
    });
  });

  it("does nothing for an already-ledgered message", async () => {
    insightFind.mockResolvedValue({ id: "x" });
    const res = await applyDecision("u1", email, { action: "create", status: "applied", company: "Valon", title: null });
    expect(res).toEqual({ wrote: false });
    expect(txAppCreate).not.toHaveBeenCalled();
  });
});

describe("applyDecision — ignore", () => {
  it("writes an ignored ledger row", async () => {
    const res = await applyDecision("u1", email, { action: "ignore", reason: "not an application email", applicationId: null });
    expect(insightCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ messageId: "m1", kind: "status_change", outcome: "ignored", applicationId: null }),
    });
    expect(res).toEqual({ wrote: true });
  });
});

describe("applyDecision — auto_apply", () => {
  it("dates an applied move from the email, not now", async () => {
    await applyDecision("u1", email, { action: "auto_apply", applicationId: "a1", fromStatus: "saved", toStatus: "applied" });
    expect(appUpdate).toHaveBeenCalledWith({ where: { id: "a1" }, data: { status: "applied", appliedAt: email.receivedAt } });
  });
});
