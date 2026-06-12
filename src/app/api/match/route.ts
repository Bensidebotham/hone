import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { scoreMatch } from "@/lib/match/score";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoEmail } from "@/lib/demo/config";

const Body = z.object({ jobId: z.string().min(1), resumeId: z.string().optional() });

export async function POST(req: Request) {
  const user = await requireUser();
  if (isDemoEmail(user.email)) {
    return NextResponse.json({ error: "This feature is disabled in the demo." }, { status: 403 });
  }
  const rl = rateLimit(`ai:${user.id}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } }
    );
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });

  const resume = parsed.data.resumeId
    ? await prisma.resume.findFirst({ where: { id: parsed.data.resumeId, userId: user.id } })
    : await prisma.resume.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  if (!resume) return NextResponse.json({ error: "No resume" }, { status: 404 });

  const job = await prisma.job.findFirst({
    where: { id: parsed.data.jobId, OR: [{ source: "ats" }, { userId: user.id }] },
  });
  if (!job) return NextResponse.json({ error: "No job" }, { status: 404 });

  const result = scoreMatch(resume.text, job.descriptionText);
  const match = await prisma.match.upsert({
    where: { resumeId_jobId: { resumeId: resume.id, jobId: job.id } },
    create: { resumeId: resume.id, jobId: job.id, score: result.score, breakdown: result as object },
    update: { score: result.score, breakdown: result as object },
  });
  return NextResponse.json({ matchId: match.id, ...result });
}
