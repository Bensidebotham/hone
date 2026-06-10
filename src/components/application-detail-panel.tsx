"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2, ExternalLink } from "lucide-react";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CompanyLogo } from "@/components/company-logo";
import { StatusPill } from "@/components/status-pill";
import { KanbanStatus } from "@/lib/applications/kanban";
import {
  updateApplicationDetails,
  deleteApplication,
  updateStatus,
} from "@/lib/applications/actions";
import type { AppWithJob } from "@/app/(app)/applications/page";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface DetailProps {
  app: AppWithJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailPanel({ app, open, onOpenChange }: DetailProps) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset transient UI whenever a different application is shown or the drawer closes.
  useEffect(() => {
    setError(null);
    setEditing(false);
    setPendingAction(null);
  }, [app?.id, open]);

  if (!app) return null;
  const isPaste = app.job.source === "paste";
  const hasHtml = Boolean(app.job.descriptionHtml);
  const hasText = Boolean(app.job.descriptionText?.trim());

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const appliedAtRaw = String(fd.get("appliedAt") ?? "");
    setError(null);
    setPendingAction("save");
    startTransition(async () => {
      try {
        await updateApplicationDetails(app!.id, {
          notes: String(fd.get("notes") ?? ""),
          appliedAt: appliedAtRaw ? new Date(appliedAtRaw) : null,
          salary: String(fd.get("salary") ?? ""),
          location: String(fd.get("location") ?? ""),
          url: String(fd.get("url") ?? ""),
        });
        onOpenChange(false);
      } catch {
        setError("Could not save changes.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleDelete() {
    setPendingAction("delete");
    startTransition(async () => {
      try {
        await deleteApplication(app!.id);
        onOpenChange(false);
      } catch {
        setError("Could not delete this application.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  function handleStatus(next: KanbanStatus) {
    if (next === app!.status) return;
    startTransition(async () => {
      try {
        await updateStatus(app!.id, next);
      } catch {
        setError("Could not update status.");
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="flex flex-col gap-5 p-6">
          {/* Header */}
          <div className="flex items-start gap-3">
            <CompanyLogo company={app.job.company} size={44} />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate">{app.job.title}</DrawerTitle>
              <p className="text-sm text-muted-foreground">{app.job.company}</p>
            </div>
            <DrawerClose
              render={
                <Button type="button" variant="ghost" aria-label="Close">
                  ×
                </Button>
              }
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusPill status={app.status as KanbanStatus} onChange={handleStatus} />
            <span className="text-sm text-muted-foreground">
              {app.job.salary ?? "—"}
              {app.job.location ? ` · ${app.job.location}` : ""}
            </span>
            {app.job.url && (
              <a
                href={app.job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
              >
                View original <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>

          <hr className="border-border" />

          {/* Summary */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Job summary
            </h3>
            {hasHtml ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                // Sanitized at ingest via sanitize-html (allowlisted tags only).
                dangerouslySetInnerHTML={{ __html: app.job.descriptionHtml! }}
              />
            ) : hasText ? (
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {app.job.descriptionText}
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground">
                No description — this role was added manually.
              </p>
            )}
          </section>

          <hr className="border-border" />

          {/* Your tracking */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Your tracking
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Applied</div>
                <div className="font-medium">{fmt(app.appliedAt)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Last activity</div>
                <div className="font-medium">{fmt(app.updatedAt)}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Notes</div>
              {app.notes ? (
                <p className="whitespace-pre-wrap text-sm">{app.notes}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground">No notes yet.</p>
              )}
            </div>
          </section>

          {/* Edit form (toggle) */}
          {editing && (
            <form key={app.id} onSubmit={handleSave} className="flex flex-col gap-3 rounded-xl border border-border p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Applied date">
                  <Input name="appliedAt" type="date" defaultValue={toDateInput(app.appliedAt)} />
                </Field>
                <Field label="Salary">
                  <Input name="salary" defaultValue={app.job.salary ?? ""} disabled={!isPaste} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Location">
                  <Input name="location" defaultValue={app.job.location ?? ""} disabled={!isPaste} />
                </Field>
                <Field label="Job URL">
                  <Input name="url" type="url" defaultValue={app.job.url ?? ""} disabled={!isPaste} />
                </Field>
              </div>
              {!isPaste && (
                <p className="text-xs text-muted-foreground">
                  This posting came from a job board, so its details are read-only. You can still edit notes and dates.
                </p>
              )}
              <Field label="Notes">
                <Textarea name="notes" defaultValue={app.notes ?? ""} className="min-h-20" />
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {pendingAction === "save" ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          )}

          {error && !editing && <p className="text-sm text-destructive">{error}</p>}

          {/* Footer actions */}
          {!editing && (
            <div className="mt-1 flex items-center justify-between">
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
                <Trash2 data-icon="inline-start" /> {pendingAction === "delete" ? "Deleting…" : "Delete"}
              </Button>
              <Button type="button" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
