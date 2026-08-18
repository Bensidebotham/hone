/**
 * What to write to GmailConnection when a Google sign-in carries the
 * gmail.readonly scope.
 *
 * Extracted from the NextAuth callback so the cursor rule is testable: it is
 * subtle enough to break silently, and getting it wrong is expensive in both
 * directions — clearing too eagerly rescans the whole window on every login,
 * clearing too rarely leaves a reconnect blind to the mail it missed.
 */
export function connectionUpdateOnSignIn({ hasFreshRefreshToken }: { hasFreshRefreshToken: boolean }) {
  return {
    syncEnabled: true,
    // The grant just worked, so any standing warning is stale.
    needsReauth: false,
    // Google issues a refresh_token only under prompt=consent, i.e. a real
    // Connect/Reconnect. Dropping the cursor makes the next sync scan by date
    // for whatever arrived while the connection was down, instead of resuming
    // from a cursor that predates the outage.
    ...(hasFreshRefreshToken ? { historyId: null } : {}),
  };
}
