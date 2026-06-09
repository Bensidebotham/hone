import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ResumeAnalysisSchema } from "@/lib/resume/prompt";
import { syncGoalsFromAnalysis, listGoals } from "@/lib/resume/goals";
import { AppNav } from "@/components/app-nav";
import { ResumeRefreshButton } from "@/components/resume-refresh-button";
import { ResumeGoals } from "@/components/resume-goals";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// Always render fresh so polling via Refresh reflects the latest DB state.
export const dynamic = "force-dynamic";

export default async function ResumeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const resume = await prisma.resume.findFirst({
    where: { id, userId: user.id },
    include: { analyses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!resume) notFound();

  const analysis = resume.analyses[0] ?? null;

  // Hoist async goals work into the async server component body (cannot call
  // async helpers inside the synchronous render IIFE below).
  let parsedAnalysis: ReturnType<typeof ResumeAnalysisSchema.safeParse> | null = null;
  let goals: Awaited<ReturnType<typeof listGoals>> = [];
  if (analysis?.status === "complete") {
    parsedAnalysis = ResumeAnalysisSchema.safeParse(analysis.result);
    if (parsedAnalysis.success) {
      await syncGoalsFromAnalysis(resume.id, parsedAnalysis.data.suggestions);
      goals = await listGoals(resume.id);
    }
  }

  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold mb-1">{resume.label}</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Uploaded {new Date(resume.createdAt).toLocaleDateString()}
        </p>

        {!analysis && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">No analysis found.</p>
            </CardContent>
          </Card>
        )}

        {analysis?.status === "pending" && (
          <Card>
            <CardHeader>
              <CardTitle>Analyzing…</CardTitle>
              <CardDescription>
                Your resume is being analyzed. This usually takes under a
                minute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResumeRefreshButton />
            </CardContent>
          </Card>
        )}

        {analysis?.status === "failed" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Analysis Failed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {analysis.error ?? "An unknown error occurred."}
              </p>
            </CardContent>
          </Card>
        )}

        {analysis?.status === "complete" && (() => {
          const parsed = parsedAnalysis!;

          if (!parsed.success) {
            return (
              <Card>
                <CardHeader>
                  <CardTitle>Analysis Complete</CardTitle>
                  <CardDescription>
                    Score: {analysis.score ?? "—"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Result data could not be parsed. Raw result is stored.
                  </p>
                </CardContent>
              </Card>
            );
          }

          const { score, ats, keywords, suggestions } = parsed.data;
          const high = suggestions.filter((s) => s.priority === "high");
          const medium = suggestions.filter((s) => s.priority === "medium");
          const low = suggestions.filter((s) => s.priority === "low");

          return (
            <div className="flex flex-col gap-6">
              {/* Score */}
              <Card>
                <CardHeader>
                  <CardTitle>Overall Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-bold">{score}</span>
                    <span className="text-muted-foreground text-lg mb-1">/ 100</span>
                  </div>
                </CardContent>
              </Card>

              {/* ATS */}
              <Card>
                <CardHeader>
                  <CardTitle>ATS Compatibility</CardTitle>
                  <CardDescription>
                    {ats.passes ? "Passes ATS screening" : "May not pass ATS screening"}
                  </CardDescription>
                </CardHeader>
                {ats.issues.length > 0 && (
                  <CardContent>
                    <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                      {ats.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Keywords */}
              <Card>
                <CardHeader>
                  <CardTitle>Keywords</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {keywords.present.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Present
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.present.map((kw) => (
                          <Badge key={kw} variant="secondary">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {keywords.missing.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Missing
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.missing.map((kw) => (
                          <Badge key={kw} variant="destructive">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Suggestions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {high.length > 0 && (
                      <SuggestionGroup label="High Priority" items={high.map((s) => s.text)} />
                    )}
                    {medium.length > 0 && (
                      <SuggestionGroup label="Medium Priority" items={medium.map((s) => s.text)} />
                    )}
                    {low.length > 0 && (
                      <SuggestionGroup label="Low Priority" items={low.map((s) => s.text)} />
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Goals — sync'd from suggestions above, rendered as a checkable list */}
              {goals.length > 0 && (
                <ResumeGoals resumeId={resume.id} goals={goals} />
              )}
            </div>
          );
        })()}
      </main>
    </div>
  );
}

function SuggestionGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </p>
      <ul className="list-disc pl-5 space-y-1 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
