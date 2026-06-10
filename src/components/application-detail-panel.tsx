"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  updateApplicationDetails,
  deleteApplication,
} from "@/lib/applications/actions";
import type { AppWithJob } from "@/app/(app)/applications/page";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

interface DetailProps {
  app: AppWithJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailPanel({ app, open, onOpenChange }: DetailProps) {
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset transient UI state whenever a different application is shown.
  useEffect(() => {
    setError(null);
    setPendingAction(null);
  }, [app?.id]);

  if (!app) return null;
  const isPaste = app.job.source === "paste";

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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogTitle>{app.job.title}</DialogTitle>
        <p className="mt-0.5 text-sm text-muted-foreground">{app.job.company}</p>

        <form key={app.id} onSubmit={handleSave} className="mt-4 flex flex-col gap-3">
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

          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isPending}>
              <Trash2 data-icon="inline-start" /> {pendingAction === "delete" ? "Deleting…" : "Delete"}
            </Button>
            <Button type="submit" disabled={isPending}>
              {pendingAction === "save" ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
