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
        <span className="font-medium">{score} / 100</span>
      ) : (
        <Link href={href} className="text-primary underline underline-offset-2">
          Not analyzed
        </Link>
      )}
    </div>
  );
}

export function HealthCard({ composite, components }: HealthCardProps) {
  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardHeader>
        <CardTitle>Profile Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-bold">{composite}</span>
          <span className="text-muted-foreground">/ 100</span>
        </div>
        <div className="space-y-2 pt-2 border-t">
          <ScoreItem label="Resume" score={components.resume} href="/resume" />
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
