import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn().mockResolvedValue({ id: "u1" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const appCreate = vi.fn().mockResolvedValue({ id: "app1" });
const appUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
const appUpdate = vi.fn().mockResolvedValue({ id: "app1" });
const appFindFirst = vi.fn().mockResolvedValue({ status: "saved" });
const appDelete = vi.fn().mockResolvedValue({ id: "app1" });
const appCount = vi.fn().mockResolvedValue(0);
const jobCreate = vi.fn().mockResolvedValue({ id: "job1" });
const jobUpdate = vi.fn().mockResolvedValue({ id: "job1" });
const jobDelete = vi.fn().mockResolvedValue({ id: "job1" });
const appEventCreate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db", () => ({
  prisma: {
    application: {
      create: (...a: any) => appCreate(...a),
      updateMany: (...a: any) => appUpdateMany(...a),
      update: (...a: any) => appUpdate(...a),
      findFirst: (...a: any) => appFindFirst(...a),
      delete: (...a: any) => appDelete(...a),
      count: (...a: any) => appCount(...a),
    },
    job: {
      create: (...a: any) => jobCreate(...a),
      update: (...a: any) => jobUpdate(...a),
      delete: (...a: any) => jobDelete(...a),
    },
    applicationEvent: {
      create: (...a: any) => appEventCreate(...a),
    },
  },
}));

import {
  addApplication,
  updateStatus,
  createManualApplication,
  updateApplicationDetails,
  deleteApplication,
} from "@/lib/applications/actions";

beforeEach(() => {
  appCreate.mockClear();
  appUpdateMany.mockClear();
  appUpdate.mockClear();
  appFindFirst.mockReset().mockResolvedValue({ status: "saved" });
  appDelete.mockClear();
  appCount.mockReset().mockResolvedValue(0);
  jobCreate.mockClear();
  jobUpdate.mockClear();
  jobDelete.mockClear();
  appEventCreate.mockClear();
});

describe("addApplication (unchanged)", () => {
  it("creates a saved app for the user", async () => {
    await addApplication("j1");
    expect(appCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "u1", jobId: "j1", status: "saved" }),
      })
    );
  });
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
  it("creates a paste-source job then a linked application", async () => {
    await createManualApplication({
      company: "Stripe",
      title: "Software Engineer",
      status: "applied",
      url: "https://x.co",
      salary: "$180k",
      location: "Remote",
      appliedAt: new Date("2024-05-01"),
      notes: "referred",
    });
    expect(jobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          source: "paste",
          company: "Stripe",
          title: "Software Engineer",
          location: "Remote",
          url: "https://x.co",
          salary: "$180k",
          descriptionText: "",
        }),
      })
    );
    expect(appCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "u1",
          jobId: "job1",
          status: "applied",
          notes: "referred",
          appliedAt: new Date("2024-05-01"),
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
    expect(jobCreate).not.toHaveBeenCalled();
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

describe("updateApplicationDetails", () => {
  it("updates application fields and the paste job's fields", async () => {
    appFindFirst.mockResolvedValue({
      id: "app1",
      jobId: "job1",
      job: { id: "job1", source: "paste" },
    });
    await updateApplicationDetails("app1", {
      notes: "n",
      appliedAt: new Date("2024-06-01"),
      salary: "$200k",
      location: "NYC",
      url: "https://y.co",
    });
    expect(appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "app1" },
        data: expect.objectContaining({ notes: "n", appliedAt: new Date("2024-06-01") }),
      })
    );
    expect(jobUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job1" },
        data: expect.objectContaining({ salary: "$200k", location: "NYC", url: "https://y.co" }),
      })
    );
  });

  it("does NOT edit job fields for an ats-sourced posting", async () => {
    appFindFirst.mockResolvedValue({
      id: "app1",
      jobId: "job1",
      job: { id: "job1", source: "ats" },
    });
    await updateApplicationDetails("app1", { notes: "n" });
    expect(appUpdate).toHaveBeenCalled();
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op when the application is not owned by the user", async () => {
    appFindFirst.mockResolvedValue(null);
    await updateApplicationDetails("nope", { notes: "n" });
    expect(appUpdate).not.toHaveBeenCalled();
    expect(jobUpdate).not.toHaveBeenCalled();
  });

  it("does not wipe job fields that were omitted from a partial update", async () => {
    appFindFirst.mockResolvedValue({
      id: "app1",
      jobId: "job1",
      job: { id: "job1", source: "paste" },
    });
    await updateApplicationDetails("app1", { notes: "just notes" });
    const jobData = jobUpdate.mock.calls[0][0].data;
    expect(jobData.salary).toBeUndefined();
    expect(jobData.location).toBeUndefined();
    expect(jobData.url).toBeUndefined();
  });

  it("clears appliedAt when explicitly passed null", async () => {
    appFindFirst.mockResolvedValue({
      id: "app1",
      jobId: "job1",
      job: { id: "job1", source: "paste" },
    });
    await updateApplicationDetails("app1", { appliedAt: null });
    expect(appUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ appliedAt: null }),
      })
    );
  });
});

describe("deleteApplication", () => {
  it("deletes the application and an orphaned paste job", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", jobId: "job1", job: { id: "job1", source: "paste" } });
    appCount.mockResolvedValue(0);
    await deleteApplication("app1");
    expect(appDelete).toHaveBeenCalledWith({ where: { id: "app1" } });
    expect(jobDelete).toHaveBeenCalledWith({ where: { id: "job1" } });
  });

  it("keeps a paste job that still has other applications", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", jobId: "job1", job: { id: "job1", source: "paste" } });
    appCount.mockResolvedValue(2);
    await deleteApplication("app1");
    expect(appDelete).toHaveBeenCalled();
    expect(jobDelete).not.toHaveBeenCalled();
  });

  it("never deletes an ats-sourced job", async () => {
    appFindFirst.mockResolvedValue({ id: "app1", jobId: "job1", job: { id: "job1", source: "ats" } });
    appCount.mockResolvedValue(0);
    await deleteApplication("app1");
    expect(appDelete).toHaveBeenCalled();
    expect(jobDelete).not.toHaveBeenCalled();
  });

  it("is a no-op when the application is not owned by the user", async () => {
    appFindFirst.mockResolvedValue(null);
    await deleteApplication("nope");
    expect(appDelete).not.toHaveBeenCalled();
  });
});
