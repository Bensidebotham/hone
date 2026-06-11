import { BrowserFrame } from "@/components/landing/browser-frame";
import { Reveal } from "@/components/landing/reveal";

const SHOTS = [
  {
    eyebrow: "Fresh jobs, every 24 hours",
    title: "A daily feed of roles worth your time",
    body: "Early-career roles, pulled straight from company boards and filtered to what you actually want — search, filter, and save without tab-hopping across a dozen career pages.",
    src: "/screenshots/jobs.png",
    label: "hone · jobs",
    alt: "The Hone jobs page: a searchable, filterable feed of engineering roles with a detail panel open",
  },
  {
    eyebrow: "Your whole pipeline",
    title: "Every application, in one calm tracker",
    body: "Saved, applied, interviewing, offer — move roles through each stage and see the whole picture at a glance. Salaries, dates, and last activity, all in a view that beats a spreadsheet.",
    src: "/screenshots/applications.png",
    label: "hone · applications",
    alt: "The Hone applications tracker: a table of roles with status pills, applied dates, and salaries",
  },
];

export function FeatureShowcase() {
  return (
    <section className="mx-auto max-w-6xl space-y-24 px-6 py-20">
      {SHOTS.map((s, i) => {
        const imageFirst = i % 2 === 1;
        return (
          <div key={s.src} className="grid items-center gap-10 lg:grid-cols-2">
            <Reveal className={imageFirst ? "lg:order-2" : ""}>
              <p className="text-sm font-semibold text-primary">{s.eyebrow}</p>
              <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {s.title}
              </h2>
              <p className="mt-4 max-w-md text-lg text-muted-foreground">{s.body}</p>
            </Reveal>
            <Reveal delay={0.1} className={imageFirst ? "lg:order-1" : ""}>
              <BrowserFrame src={s.src} alt={s.alt} label={s.label} />
            </Reveal>
          </div>
        );
      })}
    </section>
  );
}
