import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const appCreate = vi.fn().mockResolvedValue({ id: "app1" });
const appUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const appUpdate = vi.fn().mockResolvedValue({ id: "app1" });
const appFindFirst = vi.fn().mockResolvedValue({ status: "saved" });
const appFindMany = vi.fn().mockResolvedValue([]);
const appDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
const appEventCreate = vi.fn().mockResolvedValue({});
const userUpdate = vi.fn().mockResolvedValue({ id: "u1" });

vi.mock("@/lib/db", () => ({
  prisma: {
    application: {
      create: (...a: any) => appCreate(...a),
      updateMany: (...a: any) => appUpdateMany(...a),
      update: (...a: any) => appUpdate(...a),
      findFirst: (...a: any) => appFindFirst(...a),
      findMany: (...a: any) => appFindMany(...a),
      deleteMany: (...a: any) => appDeleteMany(...a),
    },
    applicationEvent: {
      create: (...a: any) => appEventCreate(...a),
    },
    user: {
      update: (...a: any) => userUpdate(...a),
    },
  },
}));

import {
  updateStatus,
  markAppliedToday,
  createManualApplication,
  updateApplicationFields,
  deleteApplication,
  bulkUpdateStatus,
  bulkMarkApplied,
  bulkDelete,
  saveColumnPrefs,
} from "@/lib/applications/actions";

// Alias to match the brief's naming for event assertions.
const recordEvent = appEventCreate;

beforeEach(() => {
  appCreate.mockClear();
  appUpdateMany.mockClear();
  appUpdate.mockClear();
  appFindFirst.mockReset().mockResolvedValue({ status: "saved" });
  appFindMany.mockReset().mockResolvedValue([]);
  appDeleteMany.mockClear();
  appEventCreate.mockClear();
  userUpdate.mockClear();
});

describe("updateStatus (unchanged)", () => {
  it("scopes the update to the user", async () => {
    await updateStatus("app1", "applied");
    expect(appUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "app1", userId: "u1" } })
    );
  });
});

describe("createManualApplication", () => {
  it("creates a standalone application with flat fields", async () => {
    appCreate.mockResolvedValue({ id: "app1" });
    await createManualApplication({
      company: "Stripe",
      title: "SWE",
      status: "applied",
      url: "https://x",
      salary: "$180k",
      location: "Remote",
      description: "JD text",
    });
    expect(appCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          company: "Stripe",
          title: "SWE",
          status: "applied",
          url: "https://x",
          salary: "$180k",
          location: "Remote",
          description: "JD text",
        }),
      })
    );
  });

  it("rejects an empty company or title", async () => {
    await expect(
      createManualApplication({ company: "  ", title: "Eng", status: "saved" })
    ).rejects.toThrow(/company/i);
    await expect(
      createManualApplication({ company: "Acme", title: "", status: "saved" })
    ).rejects.toThrow(/role|title/i);
    expect(appCreate).not.toHaveBeenCalled();
  });

  it("defaults appliedAt to now when status is past 'saved' and no date given", async () => {
    await createManualApplication({ company: "Acme", title: "Eng", status: "applied" });
    const data = appCreate.mock.calls[0][0].data;
    expect(data.appliedAt).toBeInstanceOf(Date);
  });

  it("leaves appliedAt null for a saved application", async () => {
    await createManualApplication({ company: "Acme", title: "Eng", status: "saved" });
    const data = appCreate.mock.calls[0][0].data;
    expect(data.appliedAt).toBeNull();
  });
});

describe("updateApplicationFields", () => {
  it("writes only provided fields, trimming empties to null", async () => {
    appFindFirst.mockResolvedValue({ id: "a1" });
    await updateApplicationFields("a1", { salary: " $180k ", source: "", followUpDate: null });
    expect(appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ salary: "$180k", source: null, followUpDate: null }),
      })
    );
    const data = appUpdate.mock.calls[0][0].data;
    expect(data.location).toBeUndefined(); // omitted field not touched
  });

  it("does not blank a required company/title when passed empty", async () => {
    appFindFirst.mockResolvedValue({ id: "a1" });
    await updateApplicationFields("a1", { company: "   " });
    expect(appUpdate.mock.calls[0][0].data.company).toBeUndefined();
  });

  it("writes the provided flat fields onto the application", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", userId: "u1" });
    await updateApplicationFields("app1", {
      notes: "n",
      appliedAt: new Date("2024-06-01"),
      salary: "$200k",
      location: "NYC",
      url: "https://y.co",
      description: "updated JD",
    });
    expect(appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app1" },
        data: expect.objectContaining({
          notes: "n",
          appliedAt: new Date("2024-06-01"),
          salary: "$200k",
          location: "NYC",
          url: "https://y.co",
          description: "updated JD",
        }),
      })
    );
  });

  it("is a no-op when the application is not owned by the user", async () => {
    appFindFirst.mockResolvedValue(null);
    await updateApplicationFields("nope", { notes: "n" });
    expect(appUpdate).not.toHaveBeenCalled();
  });

  it("does not wipe fields that were omitted from a partial update", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", userId: "u1" });
    await updateApplicationFields("app1", { notes: "just notes" });
    const data = appUpdate.mock.calls[0][0].data;
    expect(data.salary).toBeUndefined();
    expect(data.location).toBeUndefined();
    expect(data.url).toBeUndefined();
    expect(data.description).toBeUndefined();
  });

  it("clears appliedAt when explicitly passed null", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", userId: "u1" });
    await updateApplicationFields("app1", { appliedAt: null });
    expect(appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ appliedAt: null }),
      })
    );
  });
});

describe("bulkUpdateStatus", () => {
  it("records an event per changed app and skips no-ops", async () => {
    appFindMany.mockResolvedValue([
      { id: "a1", status: "saved" },
      { id: "a2", status: "applied" },
    ]);
    await bulkUpdateStatus(["a1", "a2"], "applied");
    expect(appUpdate).toHaveBeenCalledTimes(1); // a2 already applied → skipped
    expect(recordEvent).toHaveBeenCalledTimes(1);
  });

  it("scopes the lookup to the user and given ids", async () => {
    appFindMany.mockResolvedValue([]);
    await bulkUpdateStatus(["a1", "a2"], "applied");
    expect(appFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["a1", "a2"] }, userId: "u1" },
      })
    );
  });

  it("is a no-op for an empty id list", async () => {
    await bulkUpdateStatus([], "applied");
    expect(appFindMany).not.toHaveBeenCalled();
    expect(appUpdate).not.toHaveBeenCalled();
  });
});

describe("bulkMarkApplied", () => {
  it("stamps appliedAt for every app and records events only for newly-applied ones", async () => {
    appFindMany.mockResolvedValue([
      { id: "a1", status: "saved" },
      { id: "a2", status: "applied" },
    ]);
    await bulkMarkApplied(["a1", "a2"]);
    expect(appUpdate).toHaveBeenCalledTimes(2);
    expect(appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ status: "applied", appliedAt: expect.any(Date) }),
      })
    );
    expect(recordEvent).toHaveBeenCalledTimes(1);
    expect(recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ applicationId: "a1", toStatus: "applied" }),
      })
    );
  });

  it("is a no-op for an empty id list", async () => {
    await bulkMarkApplied([]);
    expect(appFindMany).not.toHaveBeenCalled();
    expect(appUpdate).not.toHaveBeenCalled();
  });
});

describe("bulkDelete", () => {
  it("scopes to the user", async () => {
    await bulkDelete(["a1", "a2"]);
    expect(appDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["a1", "a2"] }, userId: "u1" } });
  });

  it("is a no-op for an empty id list", async () => {
    await bulkDelete([]);
    expect(appDeleteMany).not.toHaveBeenCalled();
  });
});

describe("saveColumnPrefs", () => {
  it("writes the blob", async () => {
    await saveColumnPrefs({ order: ["company"], hidden: ["notes"] });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { applicationTablePrefs: { order: ["company"], hidden: ["notes"] } },
    });
  });
});

describe("updateStatus — event emission", () => {
  it("emits a status_change event when status changes", async () => {
    // appFindFirst default returns { status: "saved" } (set in beforeEach)
    await updateStatus("a1", "interviewing");
    expect(appEventCreate).toHaveBeenCalledOnce();
    expect(appEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "status_change",
          fromStatus: "saved",
          toStatus: "interviewing",
          applicationId: "a1",
          userId: "u1",
        }),
      })
    );
  });

  it("does NOT emit an event when status is unchanged", async () => {
    appFindFirst.mockResolvedValue({ status: "interviewing" });
    await updateStatus("a1", "interviewing");
    expect(appEventCreate).not.toHaveBeenCalled();
    expect(appUpdateMany).toHaveBeenCalledOnce();
  });
});

describe("createManualApplication — event emission", () => {
  it("emits a created event with the input status as toStatus", async () => {
    await createManualApplication({ company: "Acme", title: "Eng", status: "applied" });
    expect(appEventCreate).toHaveBeenCalledOnce();
    expect(appEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "created",
          toStatus: "applied",
          applicationId: "app1",
          userId: "u1",
        }),
      })
    );
  });
});

describe("markAppliedToday — event emission", () => {
  it("emits a status_change event with toStatus 'applied' when status changes", async () => {
    // appFindFirst default returns { status: "saved" } (set in beforeEach)
    await markAppliedToday("a1");
    expect(appEventCreate).toHaveBeenCalledOnce();
    expect(appEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "status_change",
          fromStatus: "saved",
          toStatus: "applied",
          applicationId: "a1",
          userId: "u1",
        }),
      })
    );
  });

  it("does NOT emit an event when already applied", async () => {
    appFindFirst.mockResolvedValue({ status: "applied" });
    await markAppliedToday("a1");
    expect(appEventCreate).not.toHaveBeenCalled();
    expect(appUpdateMany).toHaveBeenCalledOnce();
  });
});

describe("deleteApplication", () => {
  it("deletes the application scoped to the user", async () => {
    await deleteApplication("app1");
    expect(appDeleteMany).toHaveBeenCalledWith({
      where: { id: "app1", userId: "u1" },
    });
  });
});
