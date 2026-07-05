import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { isDemoEmail } from "@/lib/demo/config";
import { generateTailoring, NoResumeError } from "@/lib/resume/tailor";

const Body = z.object({
  jobDescription: z.string().trim().min(1),
  applicationId: z.string().optional(),
});

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
  if (!p.success) return NextResponse.json({ error: "A job description is required." }, { status: 400 });

  try {
    const result = await generateTailoring({
      userId: user.id,
      jobDescription: p.data.jobDescription,
      applicationId: p.data.applicationId,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof NoResumeError) {
      return NextResponse.json({ error: e.message, code: "no_resume" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not generate tailoring. Please try again." }, { status: 502 });
  }
}
