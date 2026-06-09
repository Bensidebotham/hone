"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function JobScopeTabs({ savedCount }: { savedCount: number }) {
  const sp = useSearchParams();
  const router = useRouter();
  const isSaved = sp.get("saved") === "true";

  function go(saved: boolean) {
    const params = new URLSearchParams(sp.toString());
    saved ? params.set("saved", "true") : params.delete("saved");
    params.delete("selected");
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  const base = "px-3 py-1.5 text-sm rounded-md transition-colors";
  const active = "bg-background shadow-sm font-medium";
  const inactive = "text-muted-foreground hover:text-foreground";
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      <button type="button" className={`${base} ${!isSaved ? active : inactive}`} onClick={() => go(false)}>All</button>
      <button type="button" className={`${base} ${isSaved ? active : inactive}`} onClick={() => go(true)}>
        Saved{savedCount > 0 ? ` (${savedCount})` : ""}
      </button>
    </div>
  );
}
