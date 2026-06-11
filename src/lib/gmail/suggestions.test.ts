import { describe, it, expect, vi, beforeEach } from "vitest";

const insightUpdate = vi.fn().mockResolvedValue({});
const findUnique = vi.fn();
const recordEvent = vi.fn().mockResolvedValue(undefined);
const createManual = vi.fn().mockResolvedValue(undefined);
const appFindFirst = vi.fn();
const appUpdate = vi.fn().mockResolvedValue({});

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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { confirmSuggestion, dismissSuggestion } from "@/lib/gmail/suggestions";

beforeEach(() => {
  insightUpdate.mockClear(); findUnique.mockClear(); recordEvent.mockClear();
  createManual.mockClear(); appFindFirst.mockClear(); appUpdate.mockClear();
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
});
