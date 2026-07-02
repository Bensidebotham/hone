import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { FunnelChart } from "./funnel-chart";
import { ConversionStats } from "./conversion-stats";
import { TimeInStageCard } from "./time-in-stage";
import type { PersonalAnalytics } from "@/lib/analytics/types";
import type { ApplicationTrendPoint } from "@/lib/dashboard/application-trend";

export function AnalyticsTabs({
  personal,
  activity,
}: {
  personal: PersonalAnalytics;
  activity: ApplicationTrendPoint[];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <ConversionStats conversion={personal.conversion} />
        <TimeInStageCard data={personal.timeInStage} />
      </div>
      <FunnelChart funnel={personal.funnel} />
      <ApplicationTrendChart points={activity} />
    </div>
  );
}
