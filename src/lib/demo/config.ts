// Identity of the shared public demo account. Anything gated to "not demo"
// (expensive AI calls, Gmail connection) checks against this address.
export const DEMO_EMAIL = "demo@hone.app";
export const DEMO_NAME = "Demo User";

export function isDemoEmail(email: string | null | undefined): boolean {
  return email?.toLowerCase() === DEMO_EMAIL;
}
