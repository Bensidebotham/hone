"use client";

import { Cell, Pie, PieChart } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { MarketAnalytics } from "@/lib/analytics/types";

const chartConfig = {
  remote: { label: "Remote", color: "var(--primary)" },
  onsite: { label: "Onsite", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

export function RemoteSplit({ remote }: { remote: MarketAnalytics["remote"] }) {
  const total = remote.remote + remote.onsite;
  const data = [
    { key: "remote", label: "Remote", value: remote.remote },
    { key: "onsite", label: "Onsite", value: remote.onsite },
  ];
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Remote vs onsite</CardTitle>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No active jobs to split yet.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={data} dataKey="value" nameKey="label" innerRadius={50} outerRadius={80}>
                <Cell fill="var(--color-remote)" />
                <Cell fill="var(--color-onsite)" />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
