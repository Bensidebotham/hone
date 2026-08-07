"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Mail } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getSuggestionEmail } from "@/lib/gmail/suggestions";
import type { SuggestionEmail } from "@/lib/gmail/suggestions";

/**
 * Reads the email a suggestion came from, so it can be checked before it's
 * confirmed. The body is fetched on open (never stored), so the first open of
 * each email shows a short loading state.
 */
export function EmailPreviewDialog({
  insightId,
  subject,
  fromEmail,
  gmailUrl,
}: {
  insightId: string;
  subject: string;
  fromEmail: string;
  gmailUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<SuggestionEmail | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Fetch once per row; the message can't change under us.
    if (next && !email && !isPending) {
      startTransition(async () => setEmail(await getSuggestionEmail(insightId)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <button
            type="button"
            title="Read this email"
            className="inline-flex min-w-0 items-center gap-1 text-primary underline-offset-4 hover:underline"
          >
            <Mail className="size-3 flex-none" />
            <span className="truncate">{subject}</span>
          </button>
        }
      />
      <DialogContent className="w-[min(92vw,42rem)]">
        <DialogTitle className="pr-6 text-base">
          {email?.ok ? email.subject : subject}
        </DialogTitle>
        <DialogDescription className="truncate">
          {email?.ok ? email.from : fromEmail}
        </DialogDescription>

        <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-lg border border-border bg-muted/40 p-4">
          {isPending || !email ? (
            <p className="text-sm text-muted-foreground">Loading email…</p>
          ) : email.ok ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{email.body}</p>
          ) : (
            <p className="text-sm text-destructive">{email.error}</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          {gmailUrl ? (
            <a
              href={gmailUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
            >
              Open in Gmail <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <span />
          )}
          <DialogClose render={<Button type="button" variant="ghost">Close</Button>} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
