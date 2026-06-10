import type { Analysis } from "@prisma/client";
import { SiteAnalysisSchema } from "@/lib/profile/site-prompt";
import { SiteForm } from "@/components/site-form";
import { ResumeRefreshButton } from "@/components/resume-refresh-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { DimensionScore, SuggestionGroup } from "@/components/profile/analysis-parts";

export function SitePanel({ analysis }: { analysis: Analysis | null }) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <SiteForm />
        </CardContent>
      </Card>
      <SiteResult analysis={analysis} />
    </div>
  );
}

function SiteResult({ analysis }: { analysis: Analysis | null }) {
  if (!analysis) return null;

  if (analysis.status === "pending") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analyzing…</CardTitle>
          <CardDescription>
            Your site is being analyzed. This usually takes under a minute.
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
  const parsed = SiteAnalysisSchema.safeParse(analysis.result);

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

  const { score, dimensions, suggestions } = parsed.data;
  const high = suggestions.filter((s) => s.priority === "high");
  const medium = suggestions.filter((s) => s.priority === "medium");
  const low = suggestions.filter((s) => s.priority === "low");

  return (
    <div className="flex flex-col gap-4">
      {analysis.sourceUrl && (
        <p className="text-sm text-muted-foreground">
          Analyzed:{" "}
          <a
            href={analysis.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {analysis.sourceUrl}
          </a>
        </p>
      )}

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
          <CardTitle>Dimension Scores</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <DimensionScore label="Professionalism" value={dimensions.professionalism} />
          <DimensionScore label="Project Showcase" value={dimensions.projectShowcase} />
          <DimensionScore label="Technical Signal" value={dimensions.technical} />
          <DimensionScore label="UX" value={dimensions.ux} />
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
