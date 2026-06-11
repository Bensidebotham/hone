import { ClipboardList, CalendarClock, Sparkles, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/landing/reveal";

const FEATURES = [
  {
    icon: ClipboardList,
    title: "Track every application",
    body: "A pipeline that beats a spreadsheet — saved, applied, interviewing, offer.",
  },
  {
    icon: CalendarClock,
    title: "Fresh jobs, every 24 hours",
    body: "Early-career roles surfaced daily, so you never miss a new posting.",
  },
  {
    icon: Sparkles,
    title: "Hone your resume",
    body: "Resume, LinkedIn, and site analysis plus job-match scoring.",
  },
  {
    icon: TrendingUp,
    title: "See your momentum",
    body: "Activity stats and applications-over-time, at a glance.",
  },
];

export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-6 py-20">
      <Reveal>
        <p className="text-center text-sm font-semibold text-primary">Everything in one place</p>
        <h2 className="mx-auto mt-2 max-w-2xl text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
          The whole job search, without the chaos
        </h2>
      </Reveal>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.05} className="h-full">
            <Card className="h-full hover:shadow-sm transition-shadow">
              <div className="flex flex-col gap-3 px-(--card-spacing)">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="font-bold tracking-tight">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
