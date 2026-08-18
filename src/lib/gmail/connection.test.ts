import { describe, it, expect } from "vitest";
import { connectionUpdateOnSignIn } from "@/lib/gmail/connection";

describe("connectionUpdateOnSignIn", () => {
  // Google only returns a refresh_token when prompt=consent ran, which is
  // exactly the Connect/Reconnect flow — so it marks a real reconnect.
  it("drops the cursor on a genuine reconnect so the next sync catches up", () => {
    expect(connectionUpdateOnSignIn({ hasFreshRefreshToken: true })).toEqual({
      syncEnabled: true,
      needsReauth: false,
      historyId: null,
    });
  });

  // An ordinary sign-in can still report the gmail.readonly scope. Clearing the
  // cursor there would trigger a full 30-day rescan on every single login.
  it("keeps the cursor on an ordinary sign-in", () => {
    expect(connectionUpdateOnSignIn({ hasFreshRefreshToken: false })).toEqual({
      syncEnabled: true,
      needsReauth: false,
    });
  });

  it("always clears the reauth warning, since the grant just worked", () => {
    expect(connectionUpdateOnSignIn({ hasFreshRefreshToken: false })).toMatchObject({
      needsReauth: false,
    });
    expect(connectionUpdateOnSignIn({ hasFreshRefreshToken: true })).toMatchObject({
      needsReauth: false,
    });
  });
});
