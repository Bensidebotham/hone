import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface HealthCardProps {
  composite: number;
  components: {
    resume: number | null;
    linkedin: number | null;
    site: number | null;
  };
}

function ScoreItem({
  label,
  score,
  href,
}: {
  label: string;
  score: number | null;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      {score !== null ? (
        <span className="font-semibold tabular-nums">{score}<span className="text-muted-foreground font-normal"> / 100</span></span>
      ) : (
        <Link href={href} className="text-primary font-medium underline underline-offset-2 decoration-primary/40">
          Analyze →
        </Link>
      )}
    </div>
  );
}

export function HealthCard({ composite, components }: HealthCardProps) {
  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          Profile Health
          <span className="h-1.5 w-1.5 rounded-full bg-highlight" aria-hidden="true" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-6xl font-extrabold tracking-tight text-primary tabular-nums">
              {composite}
            </span>
            <span className="text-muted-foreground font-medium">/ 100</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${Math.max(0, Math.min(100, composite))}%` }}
            />
          </div>
        </div>
        <div className="space-y-2.5 pt-1 border-t border-border">
          <ScoreItem label="Resume" score={components.resume} href="/profile" />
          <ScoreItem
            label="LinkedIn"
            score={components.linkedin}
            href="/profile"
          />
          <ScoreItem label="Site" score={components.site} href="/profile" />
        </div>
      </CardContent>
    </Card>
  );
}
