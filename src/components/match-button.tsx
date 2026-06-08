"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function MatchButton({ jobId }: { jobId: string }) {
  const [r, setR] = useState<{ score: number; matched: string[]; missing: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setLoading(true); setError(null);
    const res = await fetch("/api/match", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId }) });
    if (res.ok) setR(await res.json());
    else setError(res.status === 404 ? "Upload a resume first to match." : "Match failed.");
    setLoading(false);
  }
  return (
    <div className="mt-2">
      <Button size="sm" variant="outline" onClick={run} disabled={loading}>
        {loading ? "Matching…" : "Match my resume"}
      </Button>
      {error && <p className="mt-1 text-sm text-muted-foreground">{error}</p>}
      {r && (
        <div className="mt-2 space-y-1">
          <div className="font-medium">Match: {r.score}%</div>
          <div className="flex flex-wrap gap-1">
            {r.matched.map((s) => <Badge key={s}>{s}</Badge>)}
            {r.missing.map((s) => <Badge key={s} variant="secondary">{s} (gap)</Badge>)}
          </div>
        </div>
      )}
    </div>
  );
}
