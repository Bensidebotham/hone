import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { connectGmail } from "@/lib/gmail/oauth";
import type { GmailStatus } from "@/lib/gmail/status";

/** "Jul 20, 2026" — a date, not a relative age, so a long gap reads as alarming. */
function formatSyncDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Warns that Gmail sync has stopped and needs the user to re-consent.
 *
 * Renders nothing unless the grant is actually dead — a healthy connection and
 * a never-connected account both stay silent, so the banner only ever appears
 * when there is something to do.
 */
export function GmailReconnectBanner({ status }: { status: GmailStatus }) {
  if (status.state !== "needs_reauth") return null;

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-500" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">Gmail sync is disconnected</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {status.lastSyncedAt
              ? `Hone stopped reading your inbox on ${formatSyncDate(status.lastSyncedAt)}. New applications, interviews and rejections aren't being detected.`
              : "Hone can't read your inbox, so new applications, interviews and rejections aren't being detected."}
          </p>
        </div>
      </div>
      <form action={connectGmail} className="shrink-0 sm:ml-4">
        <Button type="submit" size="sm">
          Reconnect Gmail
        </Button>
      </form>
    </div>
  );
}
