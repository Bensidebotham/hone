"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShowMoreButton } from "@/components/dashboard/show-more-button";
import type { SavedRow } from "@/lib/dashboard/lists";

const COLLAPSED = 4;

export function SavedQueueCard({ rows }: { rows: SavedRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  const remaining = rows.length - COLLAPSED;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Saved · not applied</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Nothing saved waiting on you — nice and clear.
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
                    {row.url ? (
                      <Link
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:underline underline-offset-4 truncate block"
                      >
                        {row.jobTitle}
                      </Link>
                    ) : (
                      <span className="font-medium truncate block">{row.jobTitle}</span>
                    )}
                    <span className="text-muted-foreground truncate block">{row.company}</span>
                  </div>
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
              href="/applications?status=saved"
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
