import { prisma } from "@/lib/db";

export async function listSavedJobIds(userId: string): Promise<Set<string>> {
  const rows = await prisma.userSavedJob.findMany({
    where: { userId },
    select: { jobId: true },
  });
  return new Set(rows.map((r) => r.jobId));
}
