"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AppStatus } from "@prisma/client";
import type { AppUpdate } from "@/lib/health/app-updates";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";

const STATUS_VARIANT: Record<AppStatus, "default" | "secondary" | "destructive" | "outline"> = {
  offer: "default",
  interviewing: "secondary",
  applied: "secondary",
  saved: "outline",
  rejected: "destructive",
};

const COLLAPSED = 4;

export function AppUpdatesCard({ updates }: { updates: AppUpdate[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? updates : updates.slice(0, COLLAPSED);
  const remaining = updates.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Recent Updates</CardTitle>
      </CardHeader>
      <CardContent>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No recent updates.</p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((update) => (
                <li
                  key={update.id}
                  className="flex items-center justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{update.job.title}</span>
                    <span className="text-muted-foreground truncate block">
                      {update.job.company}
                    </span>
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
            {remaining > 0 && (
              <ShowMoreButton
                expanded={expanded}
                remaining={remaining}
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
            <Link
              href="/applications"
              className="mt-2 block text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              View all applications →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
