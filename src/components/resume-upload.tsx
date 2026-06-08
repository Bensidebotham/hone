"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ResumeUpload() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Please select a file.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/resume/upload", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Upload failed (${res.status})`);
      }

      const { resumeId } = (await res.json()) as { resumeId: string };
      router.push(`/resume/${resumeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          disabled={loading}
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground hover:file:bg-accent disabled:opacity-50"
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Uploading…" : "Upload & Analyze"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
