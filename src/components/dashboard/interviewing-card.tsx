"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";
import type { InterviewRow } from "@/lib/dashboard/lists";

const COLLAPSED = 4;

function relativeDays(date: Date): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function InterviewingCard({ rows }: { rows: InterviewRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  const remaining = rows.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Interviewing</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No live interview processes right now.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {visible.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="font-medium truncate block">{row.jobTitle}</span>
                    <span className="text-muted-foreground truncate block">{row.company}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {relativeDays(row.updatedAt)}
                  </span>
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
              href="/applications?status=interviewing"
              className="mt-2 block text-xs font-medium text-primary hover:underline underline-offset-4"
            >
              View all →
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
