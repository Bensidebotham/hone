// Pure token-failure vocabulary, kept out of oauth.ts because that module is
// "use server" — every export there must be an async server action.

/**
 * Why a token could not be produced.
 *
 * The distinction matters: `revoked` and `no_token` are dead ends only the
 * user can clear by re-consenting, so they're worth surfacing in the UI —
 * whereas `network` is transient and must NOT nag the user to reconnect a
 * connection that is actually fine.
 */
export type TokenFailure = "no_token" | "revoked" | "network";

export type TokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: TokenFailure };

/** Google answers 400 invalid_grant (or 401) once a refresh token is dead. */
export function isUnrecoverable(status: number): boolean {
  return status === 400 || status === 401;
}

/**
 * Whether a token failure should raise the "reconnect Gmail" warning.
 *
 * Only dead ends qualify. A transient outage must stay silent, or the warning
 * becomes noise the user learns to scroll past.
 */
export function shouldFlagReauth(reason: TokenFailure): boolean {
  return reason === "revoked" || reason === "no_token";
}
