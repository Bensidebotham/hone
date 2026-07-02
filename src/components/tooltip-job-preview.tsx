"use client";

import type { ApplicationRow } from "@/app/(app)/applications/page";
import { notesSnippet, appliedDateLabel } from "@/lib/applications/format";

interface TooltipJobPreviewProps {
  app: ApplicationRow;
}

export function TooltipJobPreview({ app }: TooltipJobPreviewProps) {
  const snippet = notesSnippet(app.notes);
  const dateLabel = appliedDateLabel(app.appliedAt, app.updatedAt);

  return (
    <div className="flex flex-col gap-1 text-left">
      <p className="font-semibold leading-snug">{app.title}</p>
      <p className="text-background/70">
        {app.company}
        {app.location ? ` · ${app.location}` : ""}
      </p>
      <p className="text-background/60 text-[11px]">{dateLabel}</p>
      {snippet && (
        <p className="text-background/70 text-[11px] italic">{snippet}</p>
      )}
    </div>
  );
}
