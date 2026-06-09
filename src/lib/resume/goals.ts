import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function syncGoalsFromAnalysis(
  resumeId: string,
  suggestions: { priority: "high" | "medium" | "low"; text: string }[]
): Promise<void> {
  const user = await requireUser();
  await Promise.all(
    suggestions.map((s) =>
      prisma.resumeGoal.upsert({
        where: { resumeId_suggestionText: { resumeId, suggestionText: s.text } },
        create: { userId: user.id, resumeId, suggestionText: s.text, priority: s.priority },
        update: { priority: s.priority },
      })
    )
  );
}

export async function listGoals(resumeId: string) {
  const user = await requireUser();
  return prisma.resumeGoal.findMany({
    where: { resumeId, userId: user.id },
    orderBy: { createdAt: "asc" },
  });
}
