"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Funnel } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "Applications", color: "var(--primary)" },
} satisfies ChartConfig;

export function FunnelChart({ funnel }: { funnel: Funnel }) {
  const data = [
    { stage: "Applied", count: funnel.applied },
    { stage: "Interviewing", count: funnel.interviewing },
    { stage: "Offer", count: funnel.offer },
  ];
  const hasData = funnel.applied > 0;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Start tracking applications to see your funnel.
          </p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="stage"
                  tickLine={false}
                  axisLine={false}
                  width={90}
                  tick={{ fontSize: 12 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
            <p className="mt-2 text-xs text-muted-foreground">
              {funnel.rejected} rejected. Stages reflect each application&apos;s
              current status, so an application rejected after interviewing counts
              only as rejected.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
