"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SiteForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Surface the server's error message directly — it explains blocklisted
        // domains (LinkedIn, job boards) and invalid/internal URLs clearly.
        setError(
          body.error ??
            (res.status === 400
              ? "Please enter a valid personal portfolio URL."
              : "Something went wrong. Please try again.")
        );
        return;
      }

      setUrl("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Enter your personal portfolio/site URL. LinkedIn and job boards
        aren&apos;t supported here — use the paste box above for LinkedIn.
      </p>
      <div className="flex gap-2">
        <Input
          type="url"
          placeholder="https://yourportfolio.dev"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          className="flex-1"
        />
        <Button type="submit" disabled={loading || url.trim().length === 0}>
          {loading ? "Analyzing…" : "Analyze Site"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
