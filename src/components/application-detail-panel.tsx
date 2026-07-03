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
  updateApplicationFields,
  deleteApplication,
  updateStatus,
} from "@/lib/applications/actions";
import type { ApplicationRow } from "@/app/(app)/applications/page";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

function fmt(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface DetailProps {
  app: ApplicationRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailPanel({ app, open, onOpenChange }: DetailProps) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(null);
  const [localStatus, setLocalStatus] = useState<KanbanStatus>("saved");
  const [isPending, startTransition] = useTransition();

  // Reset transient UI whenever a different application is shown or the drawer closes.
  useEffect(() => {
    setError(null);
    setEditing(false);
    setPendingAction(null);
    if (app) setLocalStatus(app.status as KanbanStatus);
  }, [app?.id, open]);

  if (!app) return null;

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const appliedAtRaw = String(fd.get("appliedAt") ?? "");
    setError(null);
    setPendingAction("save");
    startTransition(async () => {
      try {
        await updateApplicationFields(app!.id, {
          notes: String(fd.get("notes") ?? ""),
          appliedAt: appliedAtRaw ? new Date(appliedAtRaw) : null,
          salary: String(fd.get("salary") ?? ""),
          location: String(fd.get("location") ?? ""),
          url: String(fd.get("url") ?? ""),
          description: String(fd.get("description") ?? ""),
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
    if (next === localStatus) return;
    const prev = localStatus;
    setLocalStatus(next); // optimistic — the panel holds a frozen snapshot of `app`
    startTransition(async () => {
      try {
        await updateStatus(app!.id, next);
      } catch {
        setLocalStatus(prev);
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
            <CompanyLogo company={app.company} size={44} />
            <div className="min-w-0 flex-1">
              <DrawerTitle className="truncate">{app.title}</DrawerTitle>
              <p className="text-sm text-muted-foreground">{app.company}</p>
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
            <StatusPill status={localStatus} onChange={handleStatus} />
            <span className="text-sm text-muted-foreground">
              {app.salary ?? "—"}
              {app.location ? ` · ${app.location}` : ""}
            </span>
            {app.url && (
              <a
                href={app.url}
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
            {app.description ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{app.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No description saved.</p>
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
                  <Input name="salary" defaultValue={app.salary ?? ""} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Location">
                  <Input name="location" defaultValue={app.location ?? ""} />
                </Field>
                <Field label="Job URL">
                  <Input name="url" type="url" defaultValue={app.url ?? ""} />
                </Field>
              </div>
              <Field label="Description">
                <Textarea name="description" defaultValue={app.description ?? ""} className="min-h-20" />
              </Field>
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
