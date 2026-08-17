import { describe, it, expect } from "vitest";
import { shouldFlagReauth, isUnrecoverable } from "@/lib/gmail/token";

describe("shouldFlagReauth", () => {
  it("flags a revoked grant, which only the user can clear", () => {
    expect(shouldFlagReauth("revoked")).toBe(true);
  });

  it("flags a missing token, which also needs re-consent", () => {
    expect(shouldFlagReauth("no_token")).toBe(true);
  });

  // Flagging a transient outage would tell the user to reconnect a perfectly
  // healthy inbox, training them to ignore the warning.
  it("does not flag a transient network failure", () => {
    expect(shouldFlagReauth("network")).toBe(false);
  });
});

describe("isUnrecoverable", () => {
  it("treats 400 invalid_grant as unrecoverable", () => {
    expect(isUnrecoverable(400)).toBe(true);
  });

  it("treats 401 as unrecoverable", () => {
    expect(isUnrecoverable(401)).toBe(true);
  });

  it("treats a 5xx as recoverable so sync retries instead of alarming", () => {
    expect(isUnrecoverable(503)).toBe(false);
  });
});
