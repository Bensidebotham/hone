import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@prisma/client";
import type { AppUpdate } from "@/lib/health/app-updates";

const STATUS_VARIANT: Record<
  AppStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  offer: "default",
  interviewing: "secondary",
  applied: "secondary",
  saved: "outline",
  rejected: "destructive",
};

function timeAgo(date: Date): string {
  const ms = Date.now() - date.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function UpdatesFeed({ updates }: { updates: AppUpdate[] }) {
  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Updates</CardTitle>
        {updates.length > 0 && (
          <span className="text-xs text-muted-foreground">{updates.length}</span>
        )}
      </CardHeader>

      <CardContent>
        {updates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No updates since your last visit. Status changes will show up here —
            and auto-populate once Gmail is connected.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {updates.map((u) => (
                <li
                  key={u.id}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                >
                  {u.isNew && (
                    <span className="h-2 w-2 flex-none rounded-full bg-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="block truncate font-medium">
                      {u.summary ?? "Updated"}
                    </p>
                    <p className="block truncate text-xs text-muted-foreground">
                      {u.title} · {u.company}
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    {u.status && (
                      <Badge
                        variant={STATUS_VARIANT[u.status] ?? "outline"}
                        className="capitalize"
                      >
                        {u.status}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(u.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <Link
              href="/applications"
              className="mt-2 block text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              View all applications →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
