"use client";

import type { Prisma } from "@prisma/client";
import { notesSnippet, appliedDateLabel } from "@/lib/applications/format";

type AppWithJob = Prisma.ApplicationGetPayload<{ include: { job: true } }>;

interface TooltipJobPreviewProps {
  app: AppWithJob;
}

export function TooltipJobPreview({ app }: TooltipJobPreviewProps) {
  const snippet = notesSnippet(app.notes);
  const dateLabel = appliedDateLabel(app.appliedAt, app.updatedAt);

  return (
    <div className="flex flex-col gap-1 text-left">
      <p className="font-semibold leading-snug">{app.job.title}</p>
      <p className="text-background/70">
        {app.job.company}
        {app.job.location ? ` · ${app.job.location}` : ""}
      </p>
      <p className="text-background/60 text-[11px]">{dateLabel}</p>
      {snippet && (
        <p className="text-background/70 text-[11px] italic">{snippet}</p>
      )}
    </div>
  );
}
