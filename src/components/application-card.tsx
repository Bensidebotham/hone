"use client";

import { useTransition, useState, useEffect } from "react";
import { Prisma } from "@prisma/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TooltipJobPreview } from "@/components/tooltip-job-preview";
import { updateStatus, updateNotes } from "@/lib/applications/actions";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

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
  const [status, setStatus] = useState(app.status);
  const [notesValue, setNotesValue] = useState(app.notes ?? "");

  useEffect(() => { setStatus(app.status); }, [app.status]);

  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: app.id,
    data: { status: app.status },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value as AppStatus;
    setStatus(newStatus);
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
    <div ref={setNodeRef} style={style}>
      <Tooltip>
        {/* Base UI render prop: pass a <div> so the trigger is not a nested button */}
        <TooltipTrigger render={<div />}>
          <Card className={isPending ? "opacity-70 transition-opacity" : "transition-opacity"}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-1">
                <CardTitle className="text-sm font-semibold leading-snug">
                  {app.job.title}
                </CardTitle>
                {/* Drag handle — hidden on narrow screens; listeners isolated here */}
                <button
                  type="button"
                  ref={setActivatorNodeRef}
                  {...attributes}
                  {...listeners}
                  aria-label="Drag to move"
                  className="hidden sm:flex shrink-0 cursor-grab touch-none items-center justify-center rounded p-0.5 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
              </div>
              <CardDescription className="text-xs">
                {app.job.company}
                {app.job.location ? ` · ${app.job.location}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 pt-0">
              <div className="flex flex-col gap-1">
                <label htmlFor={`status-${app.id}`} className="text-xs font-medium text-muted-foreground">
                  Status
                </label>
                <select
                  id={`status-${app.id}`}
                  value={status}
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
                <label htmlFor={`notes-${app.id}`} className="text-xs font-medium text-muted-foreground">
                  Notes
                </label>
                <Textarea
                  id={`notes-${app.id}`}
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
        </TooltipTrigger>
        <TooltipContent side="right">
          <TooltipJobPreview app={app} />
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
