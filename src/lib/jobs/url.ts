/** Normalize a URL to a stable dedup key: lowercased host+path, no query/hash/trailing slash. */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
