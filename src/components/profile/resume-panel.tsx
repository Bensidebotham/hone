import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ResumeUpload } from "@/components/resume-upload";
import { EmptyState } from "@/components/empty-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

type ResumeWithAnalysis = Prisma.ResumeGetPayload<{
  include: { analyses: true };
}>;

export function ResumePanel({ resumes }: { resumes: ResumeWithAnalysis[] }) {
  return (
    <div className="flex flex-col gap-8">
      <Card>
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
                <Card className="hover:ring-2 hover:ring-ring transition-shadow hover:shadow-md hover:-translate-y-0.5 cursor-pointer">
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
