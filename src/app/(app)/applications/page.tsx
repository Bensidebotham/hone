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
      <h1 className="text-2xl font-semibold mb-1">Applications</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Track your job applications across every stage of the pipeline.
      </p>
      <ApplicationKanban applications={apps} />
    </div>
  );
}
