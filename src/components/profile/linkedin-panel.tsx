import type { Analysis } from "@prisma/client";
import { LinkedinAnalysisSchema } from "@/lib/profile/linkedin-prompt";
import { LinkedinForm } from "@/components/linkedin-form";
import { ResumeRefreshButton } from "@/components/resume-refresh-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SectionCritique, SuggestionGroup } from "@/components/profile/analysis-parts";

export function LinkedinPanel({ analysis }: { analysis: Analysis | null }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <LinkedinForm />
        </CardContent>
      </Card>
      <LinkedinResult analysis={analysis} />
    </div>
  );
}

function LinkedinResult({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) return null;

  if (analysis.status === "pending") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analyzing…</CardTitle>
          <CardDescription>
            Your LinkedIn profile is being analyzed. This usually takes under a
            minute.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResumeRefreshButton />
        </CardContent>
      </Card>
    );
  }

  if (analysis.status === "failed") {
    return (
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
    );
  }

  // complete
  const parsed = LinkedinAnalysisSchema.safeParse(analysis.result);

  if (!parsed.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis Complete</CardTitle>
          <CardDescription>Score: {analysis.score ?? "—"}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Result data could not be parsed. Raw result is stored.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { score, sections, suggestions } = parsed.data;
  const high = suggestions.filter((s) => s.priority === "high");
  const medium = suggestions.filter((s) => s.priority === "medium");
  const low = suggestions.filter((s) => s.priority === "low");

  return (
    <div className="flex flex-col gap-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Section Feedback</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SectionCritique label="Headline" text={sections.headline} />
          <SectionCritique label="About" text={sections.about} />
          <SectionCritique label="Experience" text={sections.experience} />
        </CardContent>
      </Card>

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
    </div>
  );
}
