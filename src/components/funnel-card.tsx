import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FUNNEL_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
};

const FUNNEL_ORDER = ["saved", "applied", "interviewing", "offer", "rejected"] as const;

interface FunnelCardProps {
  funnel: Record<"saved" | "applied" | "interviewing" | "offer" | "rejected", number>;
}

export function FunnelCard({ funnel }: FunnelCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Application Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {FUNNEL_ORDER.map((status) => (
            <div key={status} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{FUNNEL_LABELS[status]}</span>
              <span className="font-semibold text-base tabular-nums">
                {funnel[status]}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
