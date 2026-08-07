/** Message ids we mint ourselves when seeding the demo account. */
const DEMO_MESSAGE_PREFIX = "demo:";

/** True when an insight was seeded for the demo account — no real message behind it. */
export function isDemoMessageId(messageId: string): boolean {
  return messageId.startsWith(DEMO_MESSAGE_PREFIX);
}

export interface GmailMessageRef {
  messageId: string;
  threadId?: string | null;
}

/**
 * Deep link to the Gmail conversation an insight came from, so a suggestion can
 * be checked against the source email before it's confirmed.
 *
 * Links into `#all/` (rather than `#inbox/`) so archived mail still resolves,
 * and pins the account with `authuser` when we know it — `/mail/u/0/` opens
 * whichever Google account happens to be first, which is often the wrong one.
 * Returns null for seeded demo rows, which have no real message behind them.
 */
export function gmailMessageUrl(
  ref: GmailMessageRef,
  accountEmail?: string | null
): string | null {
  if (!ref.messageId || isDemoMessageId(ref.messageId)) return null;
  const id = ref.threadId ?? ref.messageId;
  const base = accountEmail
    ? `https://mail.google.com/mail/?authuser=${encodeURIComponent(accountEmail)}`
    : "https://mail.google.com/mail/u/0/";
  return `${base}#all/${encodeURIComponent(id)}`;
}
