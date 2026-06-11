import { Reveal } from "@/components/landing/reveal";

const STATS = [
  { value: "5", label: "pipeline stages, end to end" },
  { value: "24h", label: "fresh jobs, every single day" },
  { value: "1", label: "home for your whole search" },
];

export function StatsBand() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <Reveal>
        <div className="grid gap-8 rounded-2xl bg-primary/5 px-8 py-10 sm:grid-cols-3">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-4xl font-extrabold tracking-tight text-primary">{s.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
