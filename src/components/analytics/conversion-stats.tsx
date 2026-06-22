import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Conversion } from "@/lib/analytics/types";

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <div className="text-3xl font-extrabold tracking-tight">
        {value === null ? "—" : `${value}%`}
      </div>
      <div className="text-sm text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

export function ConversionStats({ conversion }: { conversion: Conversion }) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Conversion</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-10">
        <Stat label="Applied → interview" value={conversion.appliedToInterview} />
        <Stat label="Interview → offer" value={conversion.interviewToOffer} />
      </CardContent>
    </Card>
  );
}
