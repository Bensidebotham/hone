import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getTailorings } from "@/lib/resume/tailorings";
import { TailorClient } from "@/components/tailor/tailor-client";

export const dynamic = "force-dynamic";

export default async function TailorPage({
  searchParams,
}: {
  searchParams: Promise<{ applicationId?: string }>;
}) {
  const user = await requireUser();
  const { applicationId } = await searchParams;

  const [resume, app, history] = await Promise.all([
    prisma.resume.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true } }),
    applicationId
      ? prisma.application.findFirst({ where: { id: applicationId, userId: user.id }, select: { description: true } })
      : Promise.resolve(null),
    getTailorings(user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm font-semibold text-primary">Résumé</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Tailor to a job</h1>
        <p className="text-muted-foreground mt-1">
          Paste a job description — get a fit score, tailored summary, keyword gaps, and rewritten bullets to drop into your résumé.
        </p>
      </div>

      <TailorClient
        hasResume={Boolean(resume)}
        initialJobDescription={app?.description ?? ""}
        applicationId={applicationId}
      />

      {history.length > 0 && (
        <div className="mt-10">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Past tailorings</h2>
          <ul className="flex flex-col gap-2">
            {history.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-2 text-sm">
                <span className="font-medium">{t.company ? `${t.company}${t.jobTitle ? ` · ${t.jobTitle}` : ""}` : "Pasted job description"}</span>
                <span className="text-muted-foreground">Fit {t.fitScore} · {new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
