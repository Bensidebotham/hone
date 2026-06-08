"use client";
import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { addApplication } from "@/lib/applications/actions";

export function SaveJobButton({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button size="sm" variant="secondary" disabled={pending || done}
      onClick={() => start(async () => { await addApplication(jobId); setDone(true); })}>
      {done ? "Saved ✓" : "Save to tracker"}
    </Button>
  );
}
