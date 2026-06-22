"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { SalaryBucket } from "@/lib/analytics/types";

const chartConfig = {
  count: { label: "Jobs", color: "var(--primary)" },
} satisfies ChartConfig;

export function SalaryHistogram({
  buckets,
  coveragePct,
}: {
  buckets: SalaryBucket[];
  coveragePct: number | null;
}) {
  const hasData = buckets.some((b) => b.count > 0);
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Salary distribution</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Not enough listed salaries yet.
          </p>
        ) : (
          <>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <BarChart data={buckets} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={28} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
            {coveragePct !== null && (
              <p className="mt-2 text-xs text-muted-foreground">
                {coveragePct}% of active jobs list a salary.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
