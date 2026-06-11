import { Reveal } from "@/components/landing/reveal";

const STEPS = [
  { n: "1", title: "Sign in with Google", body: "No setup. You're in and tracking in seconds." },
  { n: "2", title: "Save & track roles", body: "Add jobs from the daily feed or paste your own." },
  { n: "3", title: "Stay on top of every stage", body: "Move roles through your pipeline and never lose the thread." },
];

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-border/60 bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <p className="text-center text-sm font-semibold text-primary">How it works</p>
          <h2 className="mt-2 text-center text-3xl font-extrabold tracking-tight sm:text-4xl">
            Three steps to a calmer search
          </h2>
        </Reveal>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="flex flex-col items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-base font-extrabold text-primary-foreground">
                  {s.n}
                </span>
                <h3 className="text-lg font-bold tracking-tight">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
