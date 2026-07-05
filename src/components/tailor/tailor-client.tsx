"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TailoringResultView } from "./tailoring-result";
import type { TailoringResult } from "@/lib/resume/tailor-prompt";

interface TailorClientProps {
  hasResume: boolean;
  initialJobDescription?: string;
  applicationId?: string;
}

function UploadResumePrompt() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-sm">
      <p className="font-semibold">Upload a résumé first</p>
      <p className="mt-1 text-muted-foreground">Tailoring works from your uploaded résumé. Add one to get started.</p>
      <Button className="mt-3" render={<Link href="/profile" />}>Go to Profile</Button>
    </div>
  );
}

export function TailorClient({ hasResume, initialJobDescription = "", applicationId }: TailorClientProps) {
  const [jd, setJd] = useState(initialJobDescription);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TailoringResult | null>(null);
  const [needsResume, setNeedsResume] = useState(false);

  if (!hasResume || needsResume) {
    return <UploadResumePrompt />;
  }

  async function submit() {
    if (!jd.trim()) { setError("Paste a job description first."); return; }
    setLoading(true); setError(null); setResult(null); setNeedsResume(false);
    try {
      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: jd, applicationId }),
      });
      if (res.status === 429) {
        const retry = res.headers.get("Retry-After");
        setError(`Too many requests. Try again${retry ? ` in ${retry}s` : ""}.`);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === "no_resume") {
          setNeedsResume(true);
        } else {
          setError(data?.error ?? "Something went wrong.");
        }
        return;
      }
      setResult(data as TailoringResult);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the job description…"
          className="min-h-40"
          aria-label="Job description"
        />
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={loading}>{loading ? "Tailoring…" : "Tailor résumé"}</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
      {result && <TailoringResultView result={result} />}
    </div>
  );
}
