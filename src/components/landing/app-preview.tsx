import { BrowserFrame } from "@/components/landing/browser-frame";

/** Hero product preview: a real screenshot of the digest dashboard. */
export function AppPreview() {
  return (
    <BrowserFrame
      src="/screenshots/dashboard.png"
      alt="The Hone dashboard: a feed of recent application updates, a rail of fresh job matches, and an applications-over-time chart"
      label="hone · dashboard"
      priority
    />
  );
}
