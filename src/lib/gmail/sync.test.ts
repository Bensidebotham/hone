import { describe, it, expect, vi, beforeEach } from "vitest";

const appFindMany = vi.fn();
const insightFindMany = vi.fn();
const connUpdate = vi.fn().mockResolvedValue({});
const search = vi.fn();
const getMsg = vi.fn();
const classify = vi.fn();
const apply = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    application: { findMany: (...a: any) => appFindMany(...a) },
    emailInsight: { findMany: (...a: any) => insightFindMany(...a) },
    gmailConnection: { update: (...a: any) => connUpdate(...a) },
  },
}));
vi.mock("@/lib/gmail/client", () => ({
  searchMessages: (...a: any) => search(...a),
  getMessage: (...a: any) => getMsg(...a),
}));
vi.mock("@/lib/gmail/classify", () => ({ classifyEmail: (...a: any) => classify(...a) }));
vi.mock("@/lib/gmail/apply", () => ({ applyDecision: (...a: any) => apply(...a) }));

import { syncConnection, MAX_PER_RUN } from "@/lib/gmail/sync";

const now = new Date("2026-09-23T12:00:00Z");
const conn = { userId: "u1", lastSyncedAt: new Date("2026-09-22T12:00:00Z") };

function msg(id: string, day: number, subject = "s") {
  return { id, threadId: `t-${id}`, from: "no-reply@roblox.com", subject, snippet: "", body: "", receivedAt: new Date(Date.UTC(2026, 8, day)) };
}

beforeEach(() => {
  vi.clearAllMocks();
  appFindMany.mockResolvedValue([]);
  insightFindMany.mockResolvedValue([]);
  search.mockResolvedValue([]);
  apply.mockResolvedValue({ wrote: true });
});

describe("syncConnection", () => {
  it("classifies a message returned by several queries once", async () => {
    search.mockResolvedValue(["0a"]);
    getMsg.mockResolvedValue(msg("0a", 20));
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    const res = await syncConnection(conn, "tok", now);

    expect(search.mock.calls.length).toBeGreaterThan(1);
    expect(getMsg).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ found: 1, processed: 1, failed: 0, capped: false });
  });

  it("skips messages already in the ledger", async () => {
    search.mockResolvedValue(["0a", "0b"]);
    insightFindMany.mockResolvedValue([{ messageId: "0a" }]);
    getMsg.mockResolvedValue(msg("0b", 20));
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    await syncConnection(conn, "tok", now);
    expect(getMsg).toHaveBeenCalledTimes(1);
    expect(getMsg).toHaveBeenCalledWith("tok", "0b");
  });

  it("processes oldest first and matches later mail to an app created earlier in the run", async () => {
    search.mockResolvedValue(["0b", "0a"]); // Gmail returns newest first
    getMsg.mockImplementation(async (_t: string, id: string) =>
      id === "0a" ? msg("0a", 2, "Thanks for applying") : msg("0b", 9, "Update"));
    classify.mockImplementation(async (e: any) =>
      e.subject === "Thanks for applying"
        ? { status: "applied", confidence: 0.95, company: "Roblox", title: "SWE", reason: "" }
        : { status: "rejected", confidence: 0.95, company: "Roblox", title: null, reason: "" });
    apply.mockImplementation(async (_u: string, _e: any, d: any) =>
      d.action === "create"
        ? { wrote: true, created: { applicationId: "new", company: "Roblox", title: "SWE", status: "applied" } }
        : { wrote: true });

    await syncConnection(conn, "tok", now);

    const decisions = apply.mock.calls.map((c) => c[2]);
    expect(decisions[0]).toMatchObject({ action: "create", company: "Roblox" });
    expect(decisions[1]).toEqual({ action: "auto_apply", applicationId: "new", fromStatus: "applied", toStatus: "rejected" });
    expect(apply.mock.calls[0][1].receivedAt).toEqual(new Date(Date.UTC(2026, 8, 2)));
  });

  it("sweeps only active tracked companies", async () => {
    appFindMany.mockResolvedValue([
      { id: "a", company: "Jane Street", title: "SWE", status: "applied" },
      { id: "b", company: "OldCo", title: "SWE", status: "rejected" },
    ]);
    await syncConnection(conn, "tok", now);
    const qs = search.mock.calls.map((c) => c[1] as string).join("\n");
    expect(qs).toContain('"Jane Street"');
    expect(qs).not.toContain('"OldCo"');
  });

  it("advances lastSyncedAt after a clean run", async () => {
    await syncConnection(conn, "tok", now);
    expect(connUpdate).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { lastSyncedAt: now } });
  });

  it("holds lastSyncedAt when a fetch fails, but still processes the rest", async () => {
    search.mockResolvedValue(["0a", "0b"]);
    getMsg.mockImplementation(async (_t: string, id: string) => {
      if (id === "0a") throw Object.assign(new Error("401"), { status: 401 });
      return msg("0b", 20);
    });
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    const res = await syncConnection(conn, "tok", now);
    expect(res).toMatchObject({ processed: 1, failed: 1 });
    expect(connUpdate).not.toHaveBeenCalled();
  });

  it("holds lastSyncedAt when a classification fails", async () => {
    search.mockResolvedValue(["0a"]);
    getMsg.mockResolvedValue(msg("0a", 20));
    classify.mockRejectedValue(new Error("bad json"));
    const res = await syncConnection(conn, "tok", now);
    expect(res).toMatchObject({ processed: 0, failed: 1 });
    expect(apply).not.toHaveBeenCalled();
    expect(connUpdate).not.toHaveBeenCalled();
  });

  it("caps a run and holds lastSyncedAt so the next run continues", async () => {
    const ids = Array.from({ length: MAX_PER_RUN + 5 }, (_, i) => i.toString(16).padStart(4, "0"));
    search.mockResolvedValue(ids);
    getMsg.mockImplementation(async (_t: string, id: string) => msg(id, 20));
    classify.mockResolvedValue({ status: "none", confidence: 0.9, company: null, title: null, reason: "" });

    const res = await syncConnection(conn, "tok", now);
    expect(res).toMatchObject({ found: MAX_PER_RUN + 5, processed: MAX_PER_RUN, capped: true });
    expect(getMsg).not.toHaveBeenCalledWith("tok", ids[ids.length - 1]); // oldest ids first
    expect(connUpdate).not.toHaveBeenCalled();
  });
});
