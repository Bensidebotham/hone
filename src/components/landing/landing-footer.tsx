import { signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/landing/reveal";

export function LandingFooter() {
  return (
    <footer>
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-highlight/30 blur-3xl"
            />
            <h2 className="mx-auto max-w-xl text-3xl font-extrabold tracking-tight sm:text-4xl">
              Ready to hone your search?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-primary-foreground/80">
              Sign in and turn your job hunt into a system that actually works.
            </p>
            <form action={signInWithGoogle} className="mt-8 flex justify-center">
              <Button type="submit" size="lg" variant="secondary">
                Get started →
              </Button>
            </form>
          </div>
        </Reveal>
      </section>
      <div className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 font-extrabold tracking-tight text-foreground">
            Hone <span className="h-1.5 w-1.5 rounded-full bg-highlight" />
          </span>
          <span>© 2026 Hone. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
