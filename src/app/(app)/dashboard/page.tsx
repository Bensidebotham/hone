import { requireUser } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/health/summary";
import { snapshotHealth } from "@/lib/health/snapshot";
import { AppNav } from "@/components/app-nav";
import { HealthCard } from "@/components/health-card";
import { FunnelCard } from "@/components/funnel-card";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await requireUser();
  const summary = await getDashboardSummary(user.id);
  await snapshotHealth(user.id, {
    components: summary.components,
    composite: summary.composite,
  });
  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8 space-y-6">
        <h1 className="text-2xl font-semibold">
          Welcome, {user.name ?? "there"}
        </h1>
        <div className="grid gap-6 md:grid-cols-2">
          <HealthCard
            composite={summary.composite}
            components={summary.components}
          />
          <FunnelCard funnel={summary.funnel} />
        </div>
      </main>
    </div>
  );
}
