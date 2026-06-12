import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { analyzeLinkedin } from "@/trigger/analyze-linkedin";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoEmail } from "@/lib/demo/config";

const Body = z.object({ profileText: z.string().min(20) });

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
  const p = Body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const a = await prisma.analysis.create({ data: { userId: user.id, type: "linkedin", status: "pending" } });
  await analyzeLinkedin.trigger({ analysisId: a.id, profileText: p.data.profileText });
  return NextResponse.json({ analysisId: a.id });
}
