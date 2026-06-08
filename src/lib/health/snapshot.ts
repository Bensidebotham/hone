import { prisma } from "@/lib/db";
import type { ComponentScores } from "./composite";

export async function snapshotHealth(
  userId: string,
  data: { components: ComponentScores; composite: number },
) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const existing = await prisma.healthScore.findFirst({
    where: { userId, createdAt: { gte: startOfDay } },
  });
  if (existing) return;

  await prisma.healthScore.create({
    data: {
      userId,
      resume: data.components.resume,
      linkedin: data.components.linkedin,
      site: data.components.site,
      composite: data.composite,
    },
  });
}
