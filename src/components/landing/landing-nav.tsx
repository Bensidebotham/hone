import { signInWithGoogle } from "@/app/actions/auth";
import { startDemo } from "@/lib/demo/actions";
import { Button } from "@/components/ui/button";

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground text-sm font-extrabold shadow-sm">
            H
          </span>
          <span className="text-lg font-extrabold tracking-tight">Hone</span>
          <span className="h-1.5 w-1.5 rounded-full bg-highlight" aria-hidden="true" />
        </a>
        <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="hover:text-foreground transition-colors">Features</a>
          <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <form action={startDemo}>
            <Button type="submit" variant="ghost" size="sm">Try demo</Button>
          </form>
          <form action={signInWithGoogle}>
            <Button type="submit" size="sm">Sign in</Button>
          </form>
        </div>
      </div>
    </header>
  );
}
