"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TechCount } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "Jobs", color: "var(--primary)" },
} satisfies ChartConfig;

export function TechDemandChart({ tech }: { tech: TechCount[] }) {
  if (tech.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top tech in demand</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-6 text-center">
            No tagged technologies yet.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Top tech in demand</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[320px] w-full">
          <BarChart data={tech} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="tag"
              tickLine={false}
              axisLine={false}
              width={90}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
