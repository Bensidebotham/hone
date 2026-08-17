import { describe, it, expect, vi, beforeEach } from "vitest";

const insightUpdate = vi.fn().mockResolvedValue({});
const findUnique = vi.fn();
const recordEvent = vi.fn().mockResolvedValue(undefined);
const createManual = vi.fn().mockResolvedValue(undefined);
const appFindFirst = vi.fn();
const appUpdate = vi.fn().mockResolvedValue({});
const refreshMock = vi.fn();
const refreshToken = vi.fn();
const getMessageMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    emailInsight: { findUnique: (...a: any) => findUnique(...a), update: (...a: any) => insightUpdate(...a) },
    application: { findFirst: (...a: any) => appFindFirst(...a), update: (...a: any) => appUpdate(...a) },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve({ id: "u1" }) }));
vi.mock("@/lib/applications/actions", () => ({
  createManualApplication: (...a: any) => createManual(...a),
}));
vi.mock("@/lib/applications/events", () => ({ recordApplicationEvent: (...a: any) => recordEvent(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, refresh: (...a: any) => refreshMock(...a) }));
vi.mock("@/lib/gmail/oauth", () => ({ refreshAccessToken: (...a: any) => refreshToken(...a) }));
vi.mock("@/lib/gmail/client", () => ({ getMessage: (...a: any) => getMessageMock(...a) }));

import { confirmSuggestion, dismissSuggestion, getSuggestionEmail } from "@/lib/gmail/suggestions";

beforeEach(() => {
  insightUpdate.mockClear(); findUnique.mockClear(); recordEvent.mockClear();
  createManual.mockClear(); appFindFirst.mockClear(); appUpdate.mockClear();
  refreshToken.mockReset(); getMessageMock.mockReset(); refreshMock.mockClear();
});

describe("confirmSuggestion", () => {
  it("applies a status_change suggestion as an email_detected event and marks it accepted", async () => {
    findUnique.mockResolvedValue({
      id: "i1", userId: "u1", kind: "status_change", applicationId: "app1",
      suggestedStatus: "rejected", company: null, title: null,
    });
    appFindFirst.mockResolvedValue({ status: "applied" });
    await confirmSuggestion("i1");
    expect(appUpdate).toHaveBeenCalledWith({
      where: { id: "app1" },
      data: { status: "rejected", appliedAt: undefined },
    });
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: "app1", type: "email_detected", fromStatus: "applied", toStatus: "rejected" })
    );
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { outcome: "accepted" } });
    expect(refreshMock).toHaveBeenCalled();
  });

  it("creates a new application for a new_application suggestion", async () => {
    findUnique.mockResolvedValue({
      id: "i2", userId: "u1", kind: "new_application", applicationId: null,
      suggestedStatus: "applied", company: "Acme", title: "SWE",
    });
    await confirmSuggestion("i2");
    expect(createManual).toHaveBeenCalledWith(expect.objectContaining({ company: "Acme", title: "SWE", status: "applied" }));
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i2" }, data: { outcome: "accepted" } });
  });

  it("ignores an insight that does not belong to the user", async () => {
    findUnique.mockResolvedValue({ id: "i3", userId: "other", kind: "status_change", applicationId: "app1", suggestedStatus: "rejected" });
    await confirmSuggestion("i3");
    expect(appUpdate).not.toHaveBeenCalled();
    expect(insightUpdate).not.toHaveBeenCalled();
  });
});

describe("dismissSuggestion", () => {
  it("marks the insight dismissed", async () => {
    findUnique.mockResolvedValue({ id: "i1", userId: "u1" });
    await dismissSuggestion("i1");
    expect(insightUpdate).toHaveBeenCalledWith({ where: { id: "i1" }, data: { outcome: "dismissed" } });
  });

  // The dashboard is force-dynamic, so revalidatePath has no cache entry to
  // invalidate — without refresh() the row survives until a manual reload.
  it("refreshes the client router so the row leaves the card", async () => {
    findUnique.mockResolvedValue({ id: "i1", userId: "u1" });
    await dismissSuggestion("i1");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("does not refresh when the insight belongs to someone else", async () => {
    findUnique.mockResolvedValue({ id: "i1", userId: "other" });
    await dismissSuggestion("i1");
    expect(insightUpdate).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});

describe("getSuggestionEmail", () => {
  it("reads the body through to Gmail and cleans it up", async () => {
    findUnique.mockResolvedValue({
      id: "i1", userId: "u1", messageId: "m1", fromEmail: "jobs@nvidia.com",
      subject: "Your application", snippet: "We received…",
    });
    refreshToken.mockResolvedValue({ ok: true, accessToken: "tok" });
    getMessageMock.mockResolvedValue({
      from: "NVIDIA Recruiting <jobs@nvidia.com>",
      subject: "Your application to NVIDIA",
      body: "Thanks for applying.\r\n\r\n\r\n\r\nWe'll be in touch.",
    });

    const res = await getSuggestionEmail("i1");
    expect(getMessageMock).toHaveBeenCalledWith("tok", "m1");
    expect(res).toEqual({
      ok: true,
      from: "NVIDIA Recruiting <jobs@nvidia.com>",
      subject: "Your application to NVIDIA",
      body: "Thanks for applying.\n\nWe'll be in touch.",
    });
  });

  it("falls back to the stored snippet when the message has no text body", async () => {
    findUnique.mockResolvedValue({
      id: "i1", userId: "u1", messageId: "m1", fromEmail: "jobs@nvidia.com",
      subject: "Your application", snippet: "We received your application",
    });
    refreshToken.mockResolvedValue({ ok: true, accessToken: "tok" });
    getMessageMock.mockResolvedValue({ from: "", subject: "", body: "   " });

    const res = await getSuggestionEmail("i1");
    expect(res).toMatchObject({ ok: true, body: "We received your application", subject: "Your application" });
  });

  it("never calls Gmail for a seeded demo insight", async () => {
    findUnique.mockResolvedValue({
      id: "i1", userId: "u1", messageId: "demo:Initech:status_change",
      fromEmail: "recruiting@initech.com", subject: "Next steps", snippet: null,
    });
    const res = await getSuggestionEmail("i1");
    expect(refreshToken).not.toHaveBeenCalled();
    expect(getMessageMock).not.toHaveBeenCalled();
    expect(res).toMatchObject({ ok: true, subject: "Next steps" });
  });

  it("reports a disconnected inbox instead of throwing", async () => {
    findUnique.mockResolvedValue({ id: "i1", userId: "u1", messageId: "m1", fromEmail: "a@b.com", subject: null, snippet: null });
    refreshToken.mockResolvedValue({ ok: false, reason: "revoked" });
    expect(await getSuggestionEmail("i1")).toMatchObject({ ok: false });
    expect(getMessageMock).not.toHaveBeenCalled();
  });

  it("reports a Gmail failure instead of throwing", async () => {
    findUnique.mockResolvedValue({ id: "i1", userId: "u1", messageId: "m1", fromEmail: "a@b.com", subject: null, snippet: null });
    refreshToken.mockResolvedValue({ ok: true, accessToken: "tok" });
    getMessageMock.mockRejectedValue(new Error("Gmail API 404"));
    expect(await getSuggestionEmail("i1")).toMatchObject({ ok: false });
  });

  it("refuses to read an insight belonging to another user", async () => {
    findUnique.mockResolvedValue({ id: "i1", userId: "other", messageId: "m1", fromEmail: "a@b.com", subject: null, snippet: null });
    expect(await getSuggestionEmail("i1")).toMatchObject({ ok: false });
    expect(getMessageMock).not.toHaveBeenCalled();
  });
});
