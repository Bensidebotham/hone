const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gget(accessToken: string, path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Gmail API ${res.status}: ${body}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json();
}

/** Current mailbox historyId — used to seed the sync cursor on first run. */
export async function getProfile(accessToken: string): Promise<{ historyId: string }> {
  const json = await gget(accessToken, "/profile");
  return { historyId: String(json.historyId) };
}

/**
 * New message IDs since startHistoryId. Returns { messageIds, latestHistoryId }.
 * Throws an error with .status === 404 when startHistoryId is too old (reseed).
 */
export async function listHistory(
  accessToken: string,
  startHistoryId: string
): Promise<{ messageIds: string[]; latestHistoryId: string | null }> {
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let latest: string | null = null;

  do {
    const qs = new URLSearchParams({ startHistoryId, historyTypes: "messageAdded" });
    if (pageToken) qs.set("pageToken", pageToken);
    const json: any = await gget(accessToken, `/history?${qs.toString()}`);
    if (json.historyId) latest = String(json.historyId);
    for (const h of json.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) ids.add(m.message.id);
      }
    }
    pageToken = json.nextPageToken;
  } while (pageToken);

  return { messageIds: [...ids], latestHistoryId: latest };
}

export interface FetchedMessage {
  id: string;
  threadId: string | null;
  from: string;
  subject: string;
  snippet: string;
  body: string;
}

function header(headers: any[], name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeB64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** Find the first part of a given MIME type anywhere in the tree, returning its base64url data. */
function findPartData(payload: any, mimeType: string): string | null {
  if (!payload) return null;
  if (payload.mimeType === mimeType && payload.body?.data) return payload.body.data;
  for (const part of payload.parts ?? []) {
    const found = findPartData(part, mimeType);
    if (found) return found;
  }
  return null;
}

/** Prefer text/plain anywhere in the tree; otherwise fall back to text/html stripped of tags. */
function extractBody(payload: any): string {
  const plain = findPartData(payload, "text/plain");
  if (plain) return decodeB64Url(plain);
  const html = findPartData(payload, "text/html");
  if (html) return decodeB64Url(html).replace(/<[^>]+>/g, " ");
  return "";
}

export async function getMessage(accessToken: string, id: string): Promise<FetchedMessage> {
  const json: any = await gget(accessToken, `/messages/${id}?format=full`);
  const headers = json.payload?.headers ?? [];
  return {
    id: json.id,
    threadId: json.threadId ?? null,
    from: header(headers, "From"),
    subject: header(headers, "Subject"),
    snippet: json.snippet ?? "",
    body: extractBody(json.payload),
  };
}
