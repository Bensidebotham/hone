import { describe, it, expect, vi, beforeEach } from "vitest";

const insightUpdate = vi.fn().mockResolvedValue({});
const findUnique = vi.fn();
const recordEvent = vi.fn().mockResolvedValue(undefined);
const updateStatus = vi.fn().mockResolvedValue(undefined);
const createManual = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/db", () => ({
  prisma: {
    emailInsight: { findUnique: (...a: any) => findUnique(...a), update: (...a: any) => insightUpdate(...a) },
  },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve({ id: "u1" }) }));
vi.mock("@/lib/applications/actions", () => ({
  updateStatus: (...a: any) => updateStatus(...a),
  createManualApplication: (...a: any) => createManual(...a),
}));
vi.mock("@/lib/applications/events", () => ({ recordApplicationEvent: (...a: any) => recordEvent(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { confirmSuggestion, dismissSuggestion } from "@/lib/gmail/suggestions";

beforeEach(() => {
  insightUpdate.mockClear(); findUnique.mockClear(); recordEvent.mockClear();
  updateStatus.mockClear(); createManual.mockClear();
});

describe("confirmSuggestion", () => {
  it("applies a status_change suggestion and marks it accepted", async () => {
    findUnique.mockResolvedValue({
      id: "i1", userId: "u1", kind: "status_change", applicationId: "app1",
      suggestedStatus: "rejected", company: null, title: null,
    });
    await confirmSuggestion("i1");
    expect(updateStatus).toHaveBeenCalledWith("app1", "rejected");
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
    expect(updateStatus).not.toHaveBeenCalled();
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
