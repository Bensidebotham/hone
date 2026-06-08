import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const Body = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  url: z.url().optional(),
  descriptionText: z.string().min(1),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  const job = await prisma.job.create({
    data: { userId: user.id, source: "paste", ...parsed.data },
  });
  return NextResponse.json({ jobId: job.id });
}
