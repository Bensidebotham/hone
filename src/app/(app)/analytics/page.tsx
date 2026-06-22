import { requireUser } from "@/lib/auth";
import { getPersonalAnalytics } from "@/lib/analytics/personal";
import { getMarketAnalytics } from "@/lib/analytics/market";
import { getApplicationTrend } from "@/lib/dashboard/application-trend";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await requireUser();
  const [personal, market, activity] = await Promise.all([
    getPersonalAnalytics(user.id),
    getMarketAnalytics(),
    getApplicationTrend(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          How your search is going, and what the market looks like.
        </p>
      </div>
      <AnalyticsTabs personal={personal} market={market} activity={activity} />
    </div>
  );
}
