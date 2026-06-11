import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { confirmSuggestion, dismissSuggestion } from "@/lib/gmail/suggestions";
import type { PendingSuggestion } from "@/lib/gmail/suggestions";

function label(s: PendingSuggestion): string {
  const company = s.company ?? "a company";
  if (s.kind === "new_application") {
    return s.title ? `Track ${company} — ${s.title}?` : `Track ${company}?`;
  }
  return `${company} → ${s.suggestedStatus ?? "update"}`;
}

export function SuggestedUpdates({ suggestions }: { suggestions: PendingSuggestion[] }) {
  if (suggestions.length === 0) return null;

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Suggested updates</CardTitle>
        <span className="text-xs text-muted-foreground">from email</span>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {suggestions.map((s) => (
            <li
              key={s.id}
              className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="block truncate font-medium">{label(s)}</p>
                <p className="block truncate text-xs text-muted-foreground">
                  {s.kind === "new_application" ? "Not yet tracked" : s.title ?? ""}
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
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
