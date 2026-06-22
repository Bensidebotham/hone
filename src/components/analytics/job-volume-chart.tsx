"use client";

import { useId } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { WeeklyPoint } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "New postings", color: "var(--primary)" },
} satisfies ChartConfig;

function shortDate(v: string) {
  const d = new Date(v + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function JobVolumeChart({ points }: { points: WeeklyPoint[] }) {
  const gradientId = useId();
  const hasData = points.some((p) => p.count > 0);
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>New postings over time</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No postings in this window yet.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-count)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-count)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="weekStart"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={shortDate}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={28} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
