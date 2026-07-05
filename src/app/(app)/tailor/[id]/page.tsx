import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTailoring } from "@/lib/resume/tailorings";
import { TailoringResultView } from "@/components/tailor/tailoring-result";

export const dynamic = "force-dynamic";

export default async function TailoringPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const t = await getTailoring(user.id, id);
  if (!t) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <Link href="/tailor" className="text-sm font-semibold text-primary">
          &larr; Back to Tailor
        </Link>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">
          {t.company ? `${t.company}${t.jobTitle ? ` · ${t.jobTitle}` : ""}` : "Pasted job description"}
        </h1>
      </div>

      <TailoringResultView result={t} />
    </div>
  );
}
