"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KANBAN_COLUMNS } from "@/lib/applications/kanban";
import type { KanbanStatus } from "@/lib/applications/kanban";
import { createManualApplication } from "@/lib/applications/actions";

export function AddJobDialog({ trigger }: { trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const company = String(fd.get("company") ?? "").trim();
    const title = String(fd.get("title") ?? "").trim();
    if (!company || !title) {
      setError("Company and role are required.");
      return;
    }
    const appliedAtRaw = String(fd.get("appliedAt") ?? "");
    setError(null);
    startTransition(async () => {
      try {
        await createManualApplication({
          company,
          title,
          status: String(fd.get("status")) as KanbanStatus,
          url: String(fd.get("url") ?? ""),
          salary: String(fd.get("salary") ?? ""),
          location: String(fd.get("location") ?? ""),
          appliedAt: appliedAtRaw ? new Date(appliedAtRaw) : null,
          notes: String(fd.get("notes") ?? ""),
          description: String(fd.get("description") ?? ""),
        });
        setOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add the job.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          trigger ? (
            trigger
          ) : (
            <Button>
              <Plus data-icon="inline-start" /> Add job
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogTitle>Add a job</DialogTitle>
        <DialogDescription>
          Track a role you applied to anywhere — it doesn't have to come from this app.
        </DialogDescription>

        <form key={String(open)} onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <Field label="Company *">
            <Input name="company" required placeholder="Stripe" />
          </Field>
          <Field label="Role *">
            <Input name="title" required placeholder="Software Engineer" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                name="status"
                defaultValue="applied"
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              >
                {KANBAN_COLUMNS.map((c) => (
                  <option key={c.status} value={c.status}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Applied date">
              <Input name="appliedAt" type="date" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Salary">
              <Input name="salary" placeholder="$180k" />
            </Field>
            <Field label="Location">
              <Input name="location" placeholder="Remote" />
            </Field>
          </div>
          <Field label="Job URL">
            <Input name="url" type="url" placeholder="https://…" />
          </Field>
          <Field label="Notes">
            <Textarea name="notes" placeholder="Anything worth remembering…" className="min-h-16" />
          </Field>
          <Field label="Job description">
            <Textarea
              name="description"
              placeholder="Paste the job posting — used later to tailor your resume."
              className="min-h-24"
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <DialogClose render={<Button type="button" variant="ghost">Cancel</Button>} />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add job"}
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
