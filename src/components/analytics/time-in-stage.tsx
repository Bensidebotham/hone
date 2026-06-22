import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeInStage } from "@/lib/analytics/types";

function Stat({
  label,
  days,
  n,
}: {
  label: string;
  days: number | null;
  n: number;
}) {
  return (
    <div>
      <div className="text-3xl font-extrabold tracking-tight">
        {days === null ? "—" : `${days}d`}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
      <div className="text-xs text-muted-foreground/70">
        {n < 3 ? "not enough data yet" : `median of ${n}`}
      </div>
    </div>
  );
}

export function TimeInStageCard({ data }: { data: TimeInStage }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Time in stage</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-10">
        <Stat
          label="Applied → response"
          days={data.appliedToResponseDays}
          n={data.appliedToResponseN}
        />
        <Stat
          label="Interview → decision"
          days={data.interviewToDecisionDays}
          n={data.interviewToDecisionN}
        />
      </CardContent>
    </Card>
  );
}
