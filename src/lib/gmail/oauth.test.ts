import { describe, it, expect, vi, beforeEach } from "vitest";

const accountFindFirst = vi.fn();
const accountUpdateMany = vi.fn().mockResolvedValue({});

vi.mock("@/lib/db", () => ({
  prisma: {
    account: {
      findFirst: (...a: any) => accountFindFirst(...a),
      updateMany: (...a: any) => accountUpdateMany(...a),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ signIn: vi.fn(), requireUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {} }));

import { refreshAccessToken } from "@/lib/gmail/oauth";

const fetchMock = vi.fn();

beforeEach(() => {
  accountFindFirst.mockReset();
  accountUpdateMany.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

/** An account whose stored access token is long expired, forcing a refresh. */
function staleAccount(overrides: Record<string, unknown> = {}) {
  return { access_token: "old", refresh_token: "rt", expires_at: 1, ...overrides };
}

describe("refreshAccessToken", () => {
  it("returns the still-valid access token without calling Google", async () => {
    accountFindFirst.mockResolvedValue({
      access_token: "live",
      refresh_token: "rt",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });

    expect(await refreshAccessToken("u1")).toEqual({ ok: true, accessToken: "live" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes an expired token and persists the new one", async () => {
    accountFindFirst.mockResolvedValue(staleAccount());
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ access_token: "fresh", expires_in: 3599 }),
    });

    expect(await refreshAccessToken("u1")).toEqual({ ok: true, accessToken: "fresh" });
    expect(accountUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ access_token: "fresh" }) })
    );
  });

  it("reports no_token when the user has never granted offline access", async () => {
    accountFindFirst.mockResolvedValue({ access_token: null, refresh_token: null, expires_at: null });

    expect(await refreshAccessToken("u1")).toEqual({ ok: false, reason: "no_token" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports no_token when the user has no Google account row at all", async () => {
    accountFindFirst.mockResolvedValue(null);

    expect(await refreshAccessToken("u1")).toEqual({ ok: false, reason: "no_token" });
  });

  // The failure that silently killed sync for a month: Google answers 400
  // invalid_grant once the refresh token is dead, which is unrecoverable
  // without the user re-consenting.
  it("reports revoked when Google rejects the refresh token", async () => {
    accountFindFirst.mockResolvedValue(staleAccount());
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_grant", error_description: "Bad Request" }),
    });

    expect(await refreshAccessToken("u1")).toEqual({ ok: false, reason: "revoked" });
  });

  it("reports revoked when Google answers 401", async () => {
    accountFindFirst.mockResolvedValue(staleAccount());
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });

    expect(await refreshAccessToken("u1")).toEqual({ ok: false, reason: "revoked" });
  });

  // A 5xx is transient — treating it as revoked would nag the user to
  // reconnect a connection that is actually fine.
  it("reports network for a transient Google outage rather than revoked", async () => {
    accountFindFirst.mockResolvedValue(staleAccount());
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    expect(await refreshAccessToken("u1")).toEqual({ ok: false, reason: "network" });
  });

  it("reports network when the request throws", async () => {
    accountFindFirst.mockResolvedValue(staleAccount());
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    expect(await refreshAccessToken("u1")).toEqual({ ok: false, reason: "network" });
  });
});
