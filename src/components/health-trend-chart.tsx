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
import type { HealthTrendPoint } from "@/lib/health/health-trend";

const chartConfig = {
  composite: {
    label: "Health",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

interface HealthTrendChartProps {
  points: HealthTrendPoint[];
}

export function HealthTrendChart({ points }: HealthTrendChartProps) {
  const gradientId = useId();
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Health Trend</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length < 2 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Not enough history yet — check back tomorrow.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="h-[180px] w-full">
            <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-composite)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--color-composite)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickFormatter={(v: string) => {
                  const d = new Date(v + "T00:00:00");
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11 }}
                tickCount={5}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) =>
                      new Date(value + "T00:00:00").toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    }
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="composite"
                stroke="var(--color-composite)"
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
