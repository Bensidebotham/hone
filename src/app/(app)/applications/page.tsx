import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ApplicationKanban } from "@/components/application-kanban";

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
    <div className="overflow-x-auto">
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary">Tracker</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Applications</h1>
        <p className="text-muted-foreground mt-1">
          Track your job applications across every stage of the pipeline.
        </p>
      </div>
      <ApplicationKanban applications={apps} />
    </div>
  );
}
