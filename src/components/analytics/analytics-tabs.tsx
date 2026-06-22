"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { FunnelChart } from "./funnel-chart";
import { ConversionStats } from "./conversion-stats";
import { TimeInStageCard } from "./time-in-stage";
import { JobVolumeChart } from "./job-volume-chart";
import { SalaryHistogram } from "./salary-histogram";
import { TechDemandChart } from "./tech-demand-chart";
import { RemoteSplit } from "./remote-split";
import type { PersonalAnalytics, MarketAnalytics } from "@/lib/analytics/types";
import type { ApplicationTrendPoint } from "@/lib/dashboard/application-trend";

export function AnalyticsTabs({
  personal,
  market,
  activity,
}: {
  personal: PersonalAnalytics;
  market: MarketAnalytics;
  activity: ApplicationTrendPoint[];
}) {
  return (
    <Tabs defaultValue="personal">
      <TabsList>
        <TabsTrigger value="personal">Personal</TabsTrigger>
        <TabsTrigger value="market">Market</TabsTrigger>
      </TabsList>

      <TabsContent value="personal" className="mt-5 space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <ConversionStats conversion={personal.conversion} />
          <TimeInStageCard data={personal.timeInStage} />
        </div>
        <FunnelChart funnel={personal.funnel} />
        <ApplicationTrendChart points={activity} />
      </TabsContent>

      <TabsContent value="market" className="mt-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          From your sourced job feed (new-grad / internship + ATS lists).
        </p>
        <JobVolumeChart points={market.jobVolume} />
        <div className="grid gap-5 md:grid-cols-2">
          <SalaryHistogram
            buckets={market.salary.buckets}
            coveragePct={market.salary.coveragePct}
          />
          <RemoteSplit remote={market.remote} />
        </div>
        <TechDemandChart tech={market.topTech} />
      </TabsContent>
    </Tabs>
  );
}
