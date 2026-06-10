import type { ApplicationSummary } from "@/lib/applications/table";

const TILES: { key: keyof ApplicationSummary; label: string; accent?: boolean }[] = [
  { key: "total", label: "Total tracked" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offers", label: "Offers", accent: true },
];

export function ApplicationStatTiles({ summary }: { summary: ApplicationSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {TILES.map(({ key, label, accent }) => (
        <div
          key={key}
          className={`rounded-2xl border border-border p-4 ${
            accent ? "bg-gradient-to-br from-accent to-card" : "bg-card"
          }`}
        >
          <div className="text-2xl font-extrabold tracking-tight tabular-nums">
            {summary[key]}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
