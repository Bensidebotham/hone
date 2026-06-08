"use client";

import { useTransition, useState } from "react";
import { Prisma } from "@prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { updateStatus, updateNotes } from "@/lib/applications/actions";

type AppWithJob = Prisma.ApplicationGetPayload<{ include: { job: true } }>;

const STATUS_OPTIONS = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
] as const;

type AppStatus = (typeof STATUS_OPTIONS)[number]["value"];

export function ApplicationCard({ app }: { app: AppWithJob }) {
  const [isPending, startTransition] = useTransition();
  const [notesValue, setNotesValue] = useState(app.notes ?? "");

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as AppStatus;
    startTransition(() => {
      updateStatus(app.id, newStatus);
    });
  }

  function handleNotesBlur(e: React.FocusEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    if (value === (app.notes ?? "")) return;
    startTransition(() => {
      updateNotes(app.id, value);
    });
  }

  return (
    <Card className={isPending ? "opacity-70 transition-opacity" : "transition-opacity"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold leading-snug">
          {app.job.title}
        </CardTitle>
        <CardDescription className="text-xs">
          {app.job.company}
          {app.job.location ? ` · ${app.job.location}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            defaultValue={app.status}
            onChange={handleStatusChange}
            disabled={isPending}
            className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {STATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            Notes
          </label>
          <Textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            onBlur={handleNotesBlur}
            disabled={isPending}
            placeholder="Add notes…"
            className="text-sm min-h-14 resize-none"
          />
        </div>
        {app.job.url && (
          <a
            href={app.job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-4 hover:underline"
          >
            View posting
          </a>
        )}
      </CardContent>
    </Card>
  );
}
