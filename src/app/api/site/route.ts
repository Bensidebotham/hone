import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { analyzeSite } from "@/trigger/analyze-site";
import { assertAllowedSiteUrl } from "@/lib/profile/fetch-site";

const Body = z.object({ url: z.url() });

export async function POST(req: Request) {
  const user = await requireUser();
  const p = Body.safeParse(await req.json());
  if (!p.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  // Synchronous guard: reject blocklisted/SSRF hosts up front with a clear 400
  try { assertAllowedSiteUrl(p.data.url); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const a = await prisma.analysis.create({ data: { userId: user.id, type: "site", status: "pending", sourceUrl: p.data.url } });
  await analyzeSite.trigger({ analysisId: a.id, url: p.data.url });
  return NextResponse.json({ analysisId: a.id });
}
