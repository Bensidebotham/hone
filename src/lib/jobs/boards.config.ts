export type AtsProvider = "greenhouse" | "lever" | "ashby";

export interface BoardConfig {
  provider: AtsProvider;
  slug: string;
  company: string;
}

// Public board slugs. Grow this list freely.
// All slugs validated 2026-06-09 — kept only those returning >0 jobs.
export const BOARDS: BoardConfig[] = [
  // ── Greenhouse ────────────────────────────────────────────────────────────
  { provider: "greenhouse", slug: "stripe", company: "Stripe" },
  { provider: "greenhouse", slug: "airbnb", company: "Airbnb" },
  { provider: "greenhouse", slug: "databricks", company: "Databricks" },
  { provider: "greenhouse", slug: "anthropic", company: "Anthropic" },
  { provider: "greenhouse", slug: "datadog", company: "Datadog" },
  { provider: "greenhouse", slug: "mongodb", company: "MongoDB" },
  { provider: "greenhouse", slug: "okta", company: "Okta" },
  { provider: "greenhouse", slug: "samsara", company: "Samsara" },
  { provider: "greenhouse", slug: "brex", company: "Brex" },
  { provider: "greenhouse", slug: "robinhood", company: "Robinhood" },
  { provider: "greenhouse", slug: "pinterest", company: "Pinterest" },
  { provider: "greenhouse", slug: "cloudflare", company: "Cloudflare" },
  { provider: "greenhouse", slug: "scaleai", company: "Scale AI" },
  { provider: "greenhouse", slug: "elastic", company: "Elastic" },
  { provider: "greenhouse", slug: "figma", company: "Figma" },
  { provider: "greenhouse", slug: "twilio", company: "Twilio" },
  { provider: "greenhouse", slug: "gitlab", company: "GitLab" },
  { provider: "greenhouse", slug: "affirm", company: "Affirm" },
  { provider: "greenhouse", slug: "instacart", company: "Instacart" },
  { provider: "greenhouse", slug: "lyft", company: "Lyft" },
  { provider: "greenhouse", slug: "reddit", company: "Reddit" },
  { provider: "greenhouse", slug: "asana", company: "Asana" },
  { provider: "greenhouse", slug: "sofi", company: "SoFi" },
  { provider: "greenhouse", slug: "coinbase", company: "Coinbase" },
  { provider: "greenhouse", slug: "discord", company: "Discord" },
  { provider: "greenhouse", slug: "dropbox", company: "Dropbox" },
  { provider: "greenhouse", slug: "twitch", company: "Twitch" },
  { provider: "greenhouse", slug: "chime", company: "Chime" },
  { provider: "greenhouse", slug: "gusto", company: "Gusto" },
  { provider: "greenhouse", slug: "flexport", company: "Flexport" },
  { provider: "greenhouse", slug: "airtable", company: "Airtable" },

  // ── Lever ─────────────────────────────────────────────────────────────────
  { provider: "lever", slug: "outreach", company: "Outreach" },
  { provider: "lever", slug: "palantir", company: "Palantir" },

  // ── Ashby ─────────────────────────────────────────────────────────────────
  { provider: "ashby", slug: "openai", company: "OpenAI" },
  { provider: "ashby", slug: "ramp", company: "Ramp" },
  { provider: "ashby", slug: "cohere", company: "Cohere" },
  { provider: "ashby", slug: "replit", company: "Replit" },
  { provider: "ashby", slug: "baseten", company: "Baseten" },
  { provider: "ashby", slug: "clipboard", company: "Clipboard Health" },
  { provider: "ashby", slug: "linear", company: "Linear" },
  { provider: "ashby", slug: "modal", company: "Modal" },
  { provider: "ashby", slug: "deel", company: "Deel" },
  { provider: "ashby", slug: "posthog", company: "PostHog" },
];
