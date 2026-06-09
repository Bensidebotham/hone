import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ResumeUpload } from "@/components/resume-upload";
import { EmptyState } from "@/components/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import Link from "next/link";

export default async function ResumePage() {
  const user = await requireUser();
  const resumes = await prisma.resume.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-1">Resumes</h1>
      <p className="text-muted-foreground mb-6">
        Upload a resume to get an AI-powered analysis with ATS feedback,
        keyword gaps, and improvement suggestions.
      </p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload a Resume</CardTitle>
          <CardDescription>Accepts .pdf, .docx, or .txt</CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeUpload />
        </CardContent>
      </Card>

      {resumes.length === 0 ? (
        <EmptyState
          title="No resumes yet"
          message="Upload a resume above to get an AI-powered analysis."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {resumes.map((resume) => {
            const analysis = resume.analyses[0] ?? null;
            const statusLabel = analysis
              ? analysis.status === "complete"
                ? `complete — score ${analysis.score ?? "?"}`
                : analysis.status === "failed"
                ? "failed"
                : "pending (—)"
              : "no analysis";

            return (
              <Link key={resume.id} href={`/resume/${resume.id}`}>
                <Card className="hover:ring-2 hover:ring-ring transition-shadow cursor-pointer">
                  <CardHeader>
                    <CardTitle>{resume.label}</CardTitle>
                    <CardDescription>
                      {new Date(resume.createdAt).toLocaleDateString()} ·{" "}
                      {statusLabel}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
