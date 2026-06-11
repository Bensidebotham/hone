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

/** Walk the MIME tree for the first text/plain part; fall back to text/html stripped. */
function extractBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeB64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    const text = extractBody(part);
    if (text) return text;
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeB64Url(payload.body.data).replace(/<[^>]+>/g, " ");
  }
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
