import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AppUpdate } from "@/lib/health/app-updates";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  offer: "default",
  interviewing: "default",
  applied: "secondary",
  saved: "outline",
  rejected: "destructive",
};

interface AppUpdatesCardProps {
  updates: AppUpdate[];
}

export function AppUpdatesCard({ updates }: AppUpdatesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Updates</CardTitle>
      </CardHeader>
      <CardContent>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent updates.</p>
        ) : (
          <ul className="space-y-2">
            {updates.map((update) => (
              <li key={update.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-medium truncate block">{update.job.title}</span>
                  <span className="text-muted-foreground truncate block">{update.job.company}</span>
                </div>
                <Badge
                  variant={STATUS_VARIANT[update.status] ?? "outline"}
                  className="shrink-0 capitalize"
                >
                  {update.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
