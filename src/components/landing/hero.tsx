import { startDemo } from "@/lib/demo/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";
import { AppPreview } from "@/components/landing/app-preview";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* violet glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
        <Reveal>
          <p className="text-sm font-semibold text-primary">Your job search, organized</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mx-auto mt-3 max-w-3xl text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Land your next role,{" "}
            <span className="relative isolate whitespace-nowrap">
              sharper
              <span className="absolute inset-x-0 -bottom-1 h-3 -z-10 bg-highlight/70" />
            </span>
            .
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Track every application, catch fresh jobs daily, and hone your resume —
            all in one place that beats a spreadsheet.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <form action={startDemo}>
              <Button type="submit" size="lg">Try the demo →</Button>
            </form>
            <a href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See how it works
            </a>
          </div>
        </Reveal>
        <Reveal delay={0.2} className="mt-14">
          <div className="mx-auto max-w-3xl">
            <AppPreview />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
