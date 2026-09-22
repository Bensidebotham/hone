import { describe, it, expect, vi, beforeEach } from "vitest";
import { listRecentMessages, searchMessages, getMessage } from "@/lib/gmail/client";

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

describe("listRecentMessages", () => {
  it("asks Gmail only for mail inside the requested window", async () => {
    fetchMock.mockResolvedValue(jsonOnce({ messages: [{ id: "m1" }, { id: "m2" }] }));

    const ids = await listRecentMessages("tok", { days: 30, max: 500 });

    expect(ids).toEqual(["m1", "m2"]);
    expect(decodeURIComponent(requestedUrl())).toContain("newer_than:30d");
  });

  it("follows pagination to collect every page", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "m1" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "m2" }] }));

    expect(await listRecentMessages("tok", { days: 30, max: 500 })).toEqual(["m1", "m2"]);
    expect(decodeURIComponent(requestedUrl(1))).toContain("pageToken=p2");
  });

  // Every fetched message costs a Gmail read, so an unbounded mailbox must not
  // be able to turn one catch-up into thousands of requests.
  it("stops at the cap instead of walking the whole mailbox", async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => {
      n += 1;
      return jsonOnce({
        messages: [{ id: `m${n}a` }, { id: `m${n}b` }, { id: `m${n}c` }],
        nextPageToken: "more",
      });
    });

    const ids = await listRecentMessages("tok", { days: 30, max: 5 });

    expect(ids).toHaveLength(5);
  });

  // A server that keeps handing back a nextPageToken with no new ids would
  // otherwise spin forever, since the size cap can never be reached.
  it("gives up when a page adds no new ids", async () => {
    fetchMock.mockResolvedValue(
      jsonOnce({ messages: [{ id: "same" }], nextPageToken: "always-more" })
    );

    expect(await listRecentMessages("tok", { days: 30, max: 500 })).toEqual(["same"]);
  });

  it("returns nothing when the window holds no mail", async () => {
    fetchMock.mockResolvedValue(jsonOnce({}));

    expect(await listRecentMessages("tok", { days: 30, max: 500 })).toEqual([]);
  });

  it("de-duplicates ids repeated across pages", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "m1" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(jsonOnce({ messages: [{ id: "m1" }, { id: "m2" }] }));

    expect(await listRecentMessages("tok", { days: 30, max: 500 })).toEqual(["m1", "m2"]);
  });
});

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
