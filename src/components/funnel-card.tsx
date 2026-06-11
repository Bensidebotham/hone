import Link from "next/link";
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
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Application Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {FUNNEL_ORDER.map((status) => (
            <Link
              key={status}
              href={`/applications?status=${status}`}
              className="flex items-center justify-between rounded-md px-2 py-1.5 -mx-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <span className="text-muted-foreground">{FUNNEL_LABELS[status]}</span>
              <span className="font-semibold text-base tabular-nums">{funnel[status]}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
