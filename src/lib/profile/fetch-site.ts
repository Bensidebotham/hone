/**
 * fetchSiteText — fetches the user's OWN personal/portfolio site, strips HTML,
 * and caps the output.
 *
 * Security guards (v1):
 *  1. Scheme — only http: / https: allowed.
 *  2. Domain blocklist — ToS-sensitive / login-walled sites are rejected; the
 *     user must paste content from those (paste-only workflow).
 *  3. SSRF guard — hostname / IP-literal checks block loopback, private ranges,
 *     link-local (incl. AWS metadata IP 169.254.169.254), and IPv6 loopback.
 *
 * v1 known limitations:
 *  - DNS-rebinding attacks: a domain that resolves to a public IP at validation
 *    time may rebind to a private IP at fetch time. Mitigation requires
 *    resolving the IP before fetching and re-checking (out of scope for v1).
 *  - HTTP 3xx redirects: if the server redirects to an internal address we
 *    will not re-validate the target. Full mitigation requires a custom redirect
 *    handler that re-runs all guards on each hop (out of scope for v1).
 */

const MAX_CHARS = 20_000;

/** Domains that must be paste-only. Subdomains are also blocked. */
const BLOCKED_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "glassdoor.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "ziprecruiter.com",
  "monster.com",
];

export interface FetchSiteOpts {
  /** Inject a custom fetch implementation (used in tests). Defaults to global fetch. */
  fetchFn?: typeof fetch;
}

/**
 * Returns true if the octet string (e.g. "192.168.1.10") falls within any
 * private / loopback / link-local IPv4 range.
 */
function isPrivateIPv4(hostname: string): boolean {
  // Quick check: must look like a dotted-quad
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((n) => isNaN(n) || n < 0 || n > 255)) return false;

  const [a, b] = octets;

  // 127.0.0.0/8   — loopback
  if (a === 127) return true;
  // 10.0.0.0/8    — private
  if (a === 10) return true;
  // 172.16.0.0/12 — private (172.16–172.31)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 — link-local (incl. 169.254.169.254 AWS metadata)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0
  if (octets.every((n) => n === 0)) return true;

  return false;
}

/** Strip HTML tags, collapse whitespace, and cap length. */
function stripHtml(raw: string): string {
  // Remove <script>…</script> and <style>…</style> blocks with their content
  let text = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  // Cap
  return text.slice(0, MAX_CHARS);
}

/**
 * Fetch the given URL, apply security guards, strip HTML, and return plain text.
 *
 * @throws Error with a descriptive message on any guard violation or HTTP error.
 */
export async function fetchSiteText(
  url: string,
  opts: FetchSiteOpts = {}
): Promise<string> {
  const { fetchFn = fetch } = opts;

  // --- 1. Parse & scheme check -------------------------------------------
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Only http/https URLs are allowed. Got scheme: ${parsed.protocol}`
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // --- 2. Domain blocklist -------------------------------------------------
  for (const blocked of BLOCKED_DOMAINS) {
    if (hostname === blocked || hostname.endsWith("." + blocked)) {
      throw new Error(
        `${blocked} is a paste-only source. Please paste the content directly instead of providing a URL.`
      );
    }
  }

  // --- 3. SSRF guard -------------------------------------------------------
  // Exact name checks
  if (hostname === "localhost" || hostname === "::1" || hostname === "0.0.0.0") {
    throw new Error(`Fetching internal/loopback hosts is not allowed: ${hostname}`);
  }

  // IPv4 private / loopback / link-local ranges
  if (isPrivateIPv4(hostname)) {
    throw new Error(
      `Fetching private/internal IP addresses is not allowed: ${hostname}`
    );
  }

  // --- 4. Fetch ------------------------------------------------------------
  const response = await fetchFn(url, {
    headers: {
      "user-agent":
        "JobApplicationSuite/1.0 (portfolio site reviewer; contact bsidebot@terpmail.umd.edu)",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `Fetch failed for ${url}: HTTP ${response.status}`
    );
  }

  // --- 5. Strip & cap ------------------------------------------------------
  const raw = await response.text();
  return stripHtml(raw);
}
