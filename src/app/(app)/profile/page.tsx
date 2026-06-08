import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LinkedinAnalysisSchema } from "@/lib/profile/linkedin-prompt";
import { SiteAnalysisSchema } from "@/lib/profile/site-prompt";
import { AppNav } from "@/components/app-nav";
import { LinkedinForm } from "@/components/linkedin-form";
import { SiteForm } from "@/components/site-form";
import { ResumeRefreshButton } from "@/components/resume-refresh-button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

// Always render fresh so polling via Refresh reflects the latest DB state.
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();

  const [linkedinAnalysis, siteAnalysis] = await Promise.all([
    prisma.analysis.findFirst({
      where: { userId: user.id, type: "linkedin" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.analysis.findFirst({
      where: { userId: user.id, type: "site" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold mb-1">Profile Analysis</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Get AI feedback on your LinkedIn presence and personal site.
        </p>

        <div className="flex flex-col gap-10">
          {/* ── LinkedIn Section ── */}
          <section>
            <h2 className="text-lg font-semibold mb-4">LinkedIn</h2>
            <Card className="mb-4">
              <CardContent className="pt-6">
                <LinkedinForm />
              </CardContent>
            </Card>
            <LinkedinResult analysis={linkedinAnalysis} />
          </section>

          {/* ── Site Section ── */}
          <section>
            <h2 className="text-lg font-semibold mb-4">Personal Site</h2>
            <Card className="mb-4">
              <CardContent className="pt-6">
                <SiteForm />
              </CardContent>
            </Card>
            <SiteResult analysis={siteAnalysis} />
          </section>
        </div>
      </main>
    </div>
  );
}

// ─── LinkedIn Result ───────────────────────────────────────────────────────────

type AnalysisRow = Awaited<
  ReturnType<typeof prisma.analysis.findFirst>
>;

function LinkedinResult({ analysis }: { analysis: AnalysisRow }) {
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

      {/* Section critiques */}
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

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {high.length > 0 && (
              <SuggestionGroup
                label="High Priority"
                items={high.map((s) => s.text)}
              />
            )}
            {medium.length > 0 && (
              <SuggestionGroup
                label="Medium Priority"
                items={medium.map((s) => s.text)}
              />
            )}
            {low.length > 0 && (
              <SuggestionGroup
                label="Low Priority"
                items={low.map((s) => s.text)}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Site Result ──────────────────────────────────────────────────────────────

function SiteResult({ analysis }: { analysis: AnalysisRow }) {
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
      {/* Analyzed URL */}
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

      {/* Dimensions */}
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

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {high.length > 0 && (
              <SuggestionGroup
                label="High Priority"
                items={high.map((s) => s.text)}
              />
            )}
            {medium.length > 0 && (
              <SuggestionGroup
                label="Medium Priority"
                items={medium.map((s) => s.text)}
              />
            )}
            {low.length > 0 && (
              <SuggestionGroup
                label="Low Priority"
                items={low.map((s) => s.text)}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionCritique({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-sm">{text}</p>
    </div>
  );
}

function DimensionScore({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <div className="flex items-end gap-1">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-muted-foreground text-sm mb-0.5">/ 100</span>
      </div>
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

