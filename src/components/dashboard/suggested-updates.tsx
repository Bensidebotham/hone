import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmSuggestion, dismissSuggestion } from "@/lib/gmail/suggestions";
import type { PendingSuggestion } from "@/lib/gmail/suggestions";
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
  accountEmail,
}: {
  suggestions: PendingSuggestion[];
  accountEmail?: string | null;
}) {
  if (suggestions.length === 0) return null;

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Suggested updates</CardTitle>
        <span className="text-xs text-muted-foreground">from email</span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {suggestions.map((s) => {
            const emailUrl = gmailMessageUrl(s, accountEmail);
            const emailLabel = s.subject ?? s.fromEmail;
            const sub = context(s);
            return (
            <li
              key={s.id}
              className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="block truncate font-medium">{label(s)}</p>
                <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {sub && <span className="flex-none">{sub}</span>}
                  {sub && <span className="flex-none">·</span>}
                  <EmailPreviewDialog
                    insightId={s.id}
                    subject={emailLabel}
                    fromEmail={s.fromEmail}
                    gmailUrl={emailUrl}
                  />
                </p>
              </div>
              {s.suggestedStatus && (
                <Badge variant="outline" className="capitalize">{s.suggestedStatus}</Badge>
              )}
              <div className="flex flex-none items-center gap-1">
                <form action={confirmSuggestion.bind(null, s.id)}>
                  <Button type="submit" size="sm" variant="default">Confirm</Button>
                </form>
                <form action={dismissSuggestion.bind(null, s.id)}>
                  <Button type="submit" size="sm" variant="ghost">Dismiss</Button>
                </form>
              </div>
            </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
