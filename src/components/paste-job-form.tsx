"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const emptyForm = {
  company: "",
  title: "",
  location: "",
  url: "",
  descriptionText: "",
};

export function PasteJobForm() {
  const router = useRouter();
  const [fields, setFields] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function set(key: keyof typeof emptyForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields((f) => ({ ...f, [key]: e.target.value }));
      setError(null);
      setSuccess(false);
    };
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const body: Record<string, string> = {
        company: fields.company,
        title: fields.title,
        descriptionText: fields.descriptionText,
      };
      if (fields.location.trim()) body.location = fields.location.trim();
      if (fields.url.trim()) body.url = fields.url.trim();

      const res = await fetch("/api/jobs/paste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Failed (${res.status})`);
      }

      setFields(emptyForm);
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pjf-company" className="text-sm font-medium">
            Company <span aria-hidden="true" className="text-destructive">*</span>
          </label>
          <Input
            id="pjf-company"
            value={fields.company}
            onChange={set("company")}
            placeholder="Acme Corp"
            required
            disabled={loading}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pjf-title" className="text-sm font-medium">
            Job Title <span aria-hidden="true" className="text-destructive">*</span>
          </label>
          <Input
            id="pjf-title"
            value={fields.title}
            onChange={set("title")}
            placeholder="Software Engineer"
            required
            disabled={loading}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pjf-location" className="text-sm font-medium">
            Location <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            id="pjf-location"
            value={fields.location}
            onChange={set("location")}
            placeholder="Remote / New York, NY"
            disabled={loading}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pjf-url" className="text-sm font-medium">
            Posting URL <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <Input
            id="pjf-url"
            type="url"
            value={fields.url}
            onChange={set("url")}
            placeholder="https://jobs.example.com/..."
            disabled={loading}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="pjf-desc" className="text-sm font-medium">
          Job Description <span aria-hidden="true" className="text-destructive">*</span>
        </label>
        <Textarea
          id="pjf-desc"
          value={fields.descriptionText}
          onChange={set("descriptionText")}
          placeholder="Paste the full job description here…"
          className="min-h-36"
          required
          disabled={loading}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving…" : "Add Job"}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-green-600 dark:text-green-400">Job added successfully.</p>
        )}
      </div>
    </form>
  );
}
