import type { TailoringResult } from "@/lib/resume/tailor-prompt";
import { CopyButton } from "./copy-button";
import { cn } from "@/lib/utils";

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">None.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s, i) => (
        <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{s}</span>
      ))}
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function TailoringResultView({ result }: { result: TailoringResult }) {
  const scoreColor =
    result.fitScore >= 75 ? "text-[#268a3a]" : result.fitScore >= 50 ? "text-[#9a7212]" : "text-destructive";
  return (
    <div className="flex flex-col gap-4">
      <Section title="Fit for this job">
        <div className="flex items-baseline gap-2">
          <span className={cn("text-4xl font-extrabold", scoreColor)}>{result.fitScore}</span>
          <span className="text-sm text-muted-foreground">/ 100</span>
        </div>
      </Section>

      <Section title="Tailored summary" action={<CopyButton text={result.summary} />}>
        <p className="whitespace-pre-wrap text-sm">{result.summary}</p>
      </Section>

      <Section title="Keyword gaps"><Chips items={result.keywordGaps} /></Section>

      <Section title="Tailored bullets">
        {result.tailoredBullets.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {result.tailoredBullets.map((b, i) => (
              <li key={i} className="rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground line-through">{b.original}</p>
                <div className="mt-1 flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{b.tailored}</p>
                  <CopyButton text={b.tailored} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Skills to feature"><Chips items={result.skillsToFeature} /></Section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Strengths">
          <ul className="list-disc pl-5 text-sm">{result.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </Section>
        <Section title="Gaps">
          <ul className="list-disc pl-5 text-sm">{result.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </Section>
      </div>
    </div>
  );
}
