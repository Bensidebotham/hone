"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmSuggestion, dismissSuggestion, undoAutoAdd } from "@/lib/gmail/suggestions";
import type { PendingSuggestion, RecentAutoAdd } from "@/lib/gmail/suggestions";
import { gmailMessageUrl } from "@/lib/gmail/message-link";
import { EmailPreviewDialog } from "@/components/dashboard/email-preview-dialog";

function label(s: PendingSuggestion): string {
  const company = s.company ?? "a company";
  if (s.kind === "new_application") {
    return s.title ? `Track ${company} — ${s.title}?` : `Track ${company}?`;
  }
  return `${company} → ${s.suggestedStatus ?? "update"}`;
}

/** The "why we think this" line: tracked-state on the left, source email on the right. */
function context(s: PendingSuggestion): string {
  return s.kind === "new_application" ? "Not yet tracked" : s.title ?? "";
}

export function SuggestedUpdates({
  suggestions,
  autoAdds,
  accountEmail,
}: {
  suggestions: PendingSuggestion[];
  autoAdds: RecentAutoAdd[];
  accountEmail?: string | null;
}) {
  // Acting on a suggestion is a server round trip (mutate, then re-render the
  // whole dashboard). Hide the row on click so the card reacts immediately;
  // the refresh() in the action then drops it from the server data for good.
  // A row is only restored if its action actually failed.
  const [acted, setActed] = useState<Record<string, true>>({});
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();

  function act(id: string, action: (id: string) => Promise<void>) {
    setActed((prev) => ({ ...prev, [id]: true }));
    setFailed(false);
    startTransition(async () => {
      try {
        await action(id);
      } catch {
        setActed((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        setFailed(true);
      }
    });
  }

  const visible = suggestions.filter((s) => !acted[s.id]);
  const added = autoAdds.filter((a) => !acted[a.id]);
  if (visible.length === 0 && added.length === 0) return null;
  const grouped = visible.length > 0 && added.length > 0;

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>From your email</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed && (
          <p className="text-xs text-destructive">
            That didn&apos;t go through — try again.
          </p>
        )}

        {added.length > 0 && (
          <section>
            {grouped && <h3 className="mb-1 text-xs font-medium text-muted-foreground">Added</h3>}
            <ul className="space-y-1">
              {added.map((a) => (
                <Row
                  key={a.id}
                  id={a.id}
                  title={`${a.application.company} — ${a.application.title}`}
                  sub="Added to your tracker"
                  status={a.application.status}
                  emailLabel={a.subject ?? a.fromEmail}
                  fromEmail={a.fromEmail}
                  gmailUrl={gmailMessageUrl(a, accountEmail)}
                >
                  <Button type="button" size="sm" variant="ghost" onClick={() => act(a.id, undoAutoAdd)}>
                    Undo
                  </Button>
                </Row>
              ))}
            </ul>
          </section>
        )}

        {visible.length > 0 && (
          <section>
            {grouped && <h3 className="mb-1 text-xs font-medium text-muted-foreground">Needs review</h3>}
            <ul className="space-y-1">
              {visible.map((s) => (
                <Row
                  key={s.id}
                  id={s.id}
                  title={label(s)}
                  sub={context(s)}
                  status={s.suggestedStatus}
                  emailLabel={s.subject ?? s.fromEmail}
                  fromEmail={s.fromEmail}
                  gmailUrl={gmailMessageUrl(s, accountEmail)}
                >
                  <Button type="button" size="sm" variant="default" onClick={() => act(s.id, confirmSuggestion)}>
                    Confirm
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => act(s.id, dismissSuggestion)}>
                    Dismiss
                  </Button>
                </Row>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function Row({
  id, title, sub, status, emailLabel, fromEmail, gmailUrl, children,
}: {
  id: string;
  title: string;
  sub: string;
  status: string | null;
  emailLabel: string;
  fromEmail: string;
  gmailUrl: string | null;
  children: ReactNode;
}) {
  return (
    <li className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="block truncate font-medium">{title}</p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {sub && <span className="flex-none">{sub}</span>}
          {sub && <span className="flex-none">·</span>}
          <EmailPreviewDialog insightId={id} subject={emailLabel} fromEmail={fromEmail} gmailUrl={gmailUrl} />
        </p>
      </div>
      {status && <Badge variant="outline" className="capitalize">{status}</Badge>}
      <div className="flex flex-none items-center gap-1">{children}</div>
    </li>
  );
}
