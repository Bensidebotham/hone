import { requireUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard/summary";
import { stampDashboardVisit } from "@/lib/dashboard/digest-window";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { UpdatesFeed } from "@/components/dashboard/updates-feed";
import { SuggestedUpdates } from "@/components/dashboard/suggested-updates";
import { InterviewingCard } from "@/components/dashboard/interviewing-card";
import { ActivityStatsCard } from "@/components/dashboard/activity-stats-card";
import { GmailReconnectBanner } from "@/components/gmail/reconnect-banner";
import { getGmailStatus } from "@/lib/gmail/status";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const [summary, gmail] = await Promise.all([
    getDashboardSummary(user.id),
    getGmailStatus(user.id),
  ]);
  // Stamp AFTER reading, so this load still shows everything since the prior visit.
  await stampDashboardVisit(user.id);

  return (
    <div className="space-y-6">
      {/* Above the greeting: a dead inbox silently starves everything below it. */}
      <GmailReconnectBanner status={gmail} />

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Good morning, {user.name ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s new since you last checked.
        </p>
      </div>

      <ActivityStatsCard stats={summary.activityStats} />

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-5">
          <SuggestedUpdates
            suggestions={summary.pendingSuggestions}
            accountEmail={user.email}
          />
          <UpdatesFeed updates={summary.appUpdates} />
          {/* ApplicationTrendChart already renders its own Card with title — render directly, no wrapper */}
          <ApplicationTrendChart points={summary.applicationTrend} />
        </div>

        <div className="space-y-5">
          <InterviewingCard rows={summary.interviewing} />
        </div>
      </div>
    </div>
  );
}
