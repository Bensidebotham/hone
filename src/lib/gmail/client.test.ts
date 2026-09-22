import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchMessages, getMessage } from "@/lib/gmail/client";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonOnce(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

/** The query string Gmail was actually asked for, on call N. */
function requestedUrl(call = 0): string {
  return String(fetchMock.mock.calls[call][0]);
}

describe("searchMessages", () => {
  it("sends the query verbatim and returns ids", async () => {
    fetchMock.mockResolvedValue(jsonOnce({ messages: [{ id: "m1" }, { id: "m2" }] }));
    const ids = await searchMessages("tok", 'from:(lever.co) after:123', { max: 2000 });
    expect(ids).toEqual(["m1", "m2"]);
    const url = new URL(requestedUrl());
    expect(url.searchParams.get("q")).toBe("from:(lever.co) after:123");
    expect(url.searchParams.get("maxResults")).toBe("500");
  });

  it("follows pagination and stops at the cap", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "a" }, { id: "b" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "c" }, { id: "d" }], nextPageToken: "p3" }));
    expect(await searchMessages("tok", "q", { max: 3 })).toEqual(["a", "b", "c"]);
    expect(new URL(requestedUrl(1)).searchParams.get("pageToken")).toBe("p2");
  });

  it("returns [] when Gmail reports no messages", async () => {
    fetchMock.mockResolvedValue(jsonOnce({ resultSizeEstimate: 0 }));
    expect(await searchMessages("tok", "q", { max: 10 })).toEqual([]);
  });

  it("gives up when a page adds no new ids", async () => {
    fetchMock.mockResolvedValue(jsonOnce({ messages: [{ id: "same" }], nextPageToken: "more" }));
    expect(await searchMessages("tok", "q", { max: 10 })).toEqual(["same"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getMessage", () => {
  it("returns receivedAt from internalDate", async () => {
    fetchMock.mockResolvedValue(jsonOnce({
      id: "m1", threadId: "t1", internalDate: "1758585600000", snippet: "s",
      payload: { headers: [{ name: "From", value: "a@b.com" }, { name: "Subject", value: "Hi" }] },
    }));
    const msg = await getMessage("tok", "m1");
    expect(msg.receivedAt).toEqual(new Date(1758585600000));
  });
});
