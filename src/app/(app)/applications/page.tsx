import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApplicationsTable } from "@/components/applications-table";
import { AddJobDialog } from "@/components/add-job-dialog";

export const dynamic = "force-dynamic";

export type AppWithJob = Prisma.ApplicationGetPayload<{ include: { job: true } }>;

export default async function ApplicationsPage() {
  const user = await requireUser();
  const apps = await prisma.application.findMany({
    where: { userId: user.id },
    include: { job: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Tracker</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">
            Every role you're chasing — in one place that beats a spreadsheet.
          </p>
        </div>
        <AddJobDialog />
      </div>
      <ApplicationsTable applications={apps} />
    </div>
  );
}
