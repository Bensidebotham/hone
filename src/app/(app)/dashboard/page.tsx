import { requireUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard/summary";
import { ActivityStatsCard } from "@/components/dashboard/activity-stats-card";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { InterviewingCard } from "@/components/dashboard/interviewing-card";
import { SavedQueueCard } from "@/components/dashboard/saved-queue-card";
import { FunnelCard } from "@/components/funnel-card";
import { NewJobsCard } from "@/components/new-jobs-card";
import { AppUpdatesCard } from "@/components/app-updates-card";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const summary = await getDashboardSummary(user.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Dashboard</p>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Welcome back, {user.name ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">Your job search at a glance.</p>
      </div>

      <ActivityStatsCard stats={summary.stats} />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <div className="md:col-span-2">
          <ApplicationTrendChart points={summary.applicationTrend} />
        </div>
        <FunnelCard funnel={summary.funnel} />

        <NewJobsCard
          jobs={summary.newJobs.map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            url: j.url,
          }))}
        />
        <AppUpdatesCard updates={summary.appUpdates} />
        <InterviewingCard rows={summary.interviewing} />
        <SavedQueueCard rows={summary.savedNotApplied} />
      </div>
    </div>
  );
}
