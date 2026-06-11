import { requireUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard/summary";
import { stampDashboardVisit } from "@/lib/dashboard/digest-window";
import { ApplicationTrendChart } from "@/components/dashboard/application-trend-chart";
import { UpdatesFeed } from "@/components/dashboard/updates-feed";
import { NewJobsRail } from "@/components/dashboard/new-jobs-rail";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const summary = await getDashboardSummary(user.id);
  // Stamp AFTER reading, so this load still shows everything since the prior visit.
  await stampDashboardVisit(user.id);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-primary">Dashboard</p>
        <h1 className="text-3xl font-extrabold tracking-tight">
          Good morning, {user.name ?? "there"}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s new since you last checked.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-5">
          <UpdatesFeed updates={summary.appUpdates} />
          {/* ApplicationTrendChart already renders its own Card with title — render directly, no wrapper */}
          <ApplicationTrendChart points={summary.applicationTrend} />
        </div>

        <NewJobsRail
          jobs={summary.newJobs.map((j) => ({
            id: j.id,
            title: j.title,
            company: j.company,
            location: j.location,
            url: j.url,
          }))}
        />
      </div>
    </div>
  );
}
