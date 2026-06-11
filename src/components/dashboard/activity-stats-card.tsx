// src/components/dashboard/activity-stats-card.tsx
import { Card } from "@/components/ui/card";
import type { ActivityStats } from "@/lib/dashboard/stats";

function Tile({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <div className="flex flex-col gap-1 px-(--card-spacing)">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {accent && <span className="h-1.5 w-1.5 rounded-full bg-highlight" />}
          {label}
        </span>
        <span className="text-2xl font-extrabold tracking-tight tabular-nums">{value}</span>
      </div>
    </Card>
  );
}

export function ActivityStatsCard({ stats }: { stats: ActivityStats }) {
  return (
    <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
      <Tile label="Applied this week" value={stats.appliedThisWeek} accent />
      <Tile label="Applied (all-time)" value={stats.appliedTotal} />
      <Tile label="Interviewing" value={stats.interviewing} />
      <Tile
        label="Response rate"
        value={stats.responseRate === null ? "—" : `${stats.responseRate}%`}
      />
    </div>
  );
}
