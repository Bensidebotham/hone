import type { Application } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApplicationSpreadsheet } from "@/components/spreadsheet/application-spreadsheet";
import { AddJobDialog } from "@/components/add-job-dialog";
import { isKanbanStatus } from "@/lib/applications/kanban";
import type { TablePrefs } from "@/lib/applications/columns";

export const dynamic = "force-dynamic";

export type ApplicationRow = Application;

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requireUser();
  const { status } = await searchParams;
  const statusFilter = status && isKanbanStatus(status) ? status : undefined;

  const [apps, dbUser] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id, ...(statusFilter ? { status: statusFilter } : {}) },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { applicationTablePrefs: true } }),
  ]);
  const prefs = (dbUser?.applicationTablePrefs ?? null) as TablePrefs | null;

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-primary">Tracker</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
          <p className="text-muted-foreground mt-1">
            Every role you&apos;re chasing — in one place that beats a spreadsheet.
          </p>
        </div>
        <AddJobDialog />
      </div>
      <ApplicationSpreadsheet applications={apps} prefs={prefs} />
    </div>
  );
}
