import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { extractText } from "@/lib/resume/extract";
import { analyzeResume } from "@/trigger/analyze-resume";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoEmail } from "@/lib/demo/config";

export const runtime = "nodejs";

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
  const form = await req.formData();
  const file = form.get("file");
  // Use duck-type check: `instanceof File` fails in test environments where undici
  // and jsdom expose different File classes. Checking constructor name + arrayBuffer
  // is equivalent and works across runtimes.
  if (!file || typeof (file as any).arrayBuffer !== "function" || !(file as any).name) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  const typedFile = file as File;

  const buf = Buffer.from(await typedFile.arrayBuffer());
  const text = await extractText(buf, typedFile.type);

  const resume = await prisma.resume.create({
    data: { userId: user.id, label: typedFile.name, text },
  });
  const analysis = await prisma.analysis.create({
    data: { userId: user.id, type: "resume", status: "pending", resumeId: resume.id },
  });
  await analyzeResume.trigger({ analysisId: analysis.id, resumeText: resume.text });

  return NextResponse.json({ resumeId: resume.id, analysisId: analysis.id });
}
