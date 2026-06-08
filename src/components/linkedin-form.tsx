"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function LinkedinForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileText: text }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          res.status === 400
            ? (body.error ?? "Paste at least 20 characters of your LinkedIn profile text.")
            : "Something went wrong. Please try again."
        );
        return;
      }

      setText("");
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
        Paste your LinkedIn headline, About, and Experience text. (We never log
        into or scrape LinkedIn.)
      </p>
      <Textarea
        placeholder="Paste your LinkedIn profile text here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        disabled={loading}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={loading || text.trim().length === 0}>
        {loading ? "Analyzing…" : "Analyze LinkedIn Profile"}
      </Button>
    </form>
  );
}
