import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AppNav } from "@/components/app-nav";
import { ApplicationCard } from "@/components/application-card";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { status: "saved", label: "Saved" },
  { status: "applied", label: "Applied" },
  { status: "interviewing", label: "Interviewing" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Rejected" },
] as const;

export type AppWithJob = Prisma.ApplicationGetPayload<{ include: { job: true } }>;

export default async function ApplicationsPage() {
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: { userId: user.id },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8 overflow-x-auto">
        <h1 className="text-2xl font-semibold mb-1">Applications</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Track your job applications across every stage of the pipeline.
        </p>
        <div className="grid grid-cols-5 gap-4 min-w-[900px]">
          {COLUMNS.map(({ status, label }) => {
            const column = apps.filter((a) => a.status === status);
            return (
              <div key={status} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </h2>
                  {column.length > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {column.length}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {column.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-4 text-center">
                      <p className="text-xs text-muted-foreground">None yet</p>
                    </div>
                  ) : (
                    column.map((app) => (
                      <ApplicationCard key={app.id} app={app} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
