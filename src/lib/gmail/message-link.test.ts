import { describe, it, expect } from "vitest";
import { gmailMessageUrl } from "@/lib/gmail/message-link";

describe("gmailMessageUrl", () => {
  it("links to the thread and pins the account when we know the address", () => {
    expect(gmailMessageUrl({ messageId: "m1", threadId: "t1" }, "me@example.com")).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#all/t1"
    );
  });

  it("falls back to the message id when the insight has no thread", () => {
    expect(gmailMessageUrl({ messageId: "m1", threadId: null }, "me@example.com")).toBe(
      "https://mail.google.com/mail/?authuser=me%40example.com#all/m1"
    );
  });

  it("falls back to the default account when the address is unknown", () => {
    expect(gmailMessageUrl({ messageId: "m1", threadId: "t1" })).toBe(
      "https://mail.google.com/mail/u/0/#all/t1"
    );
  });

  it("returns null for seeded demo insights, which have no real message", () => {
    expect(gmailMessageUrl({ messageId: "demo:NVIDIA:new_application" }, "me@example.com")).toBeNull();
  });
});
