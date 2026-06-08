import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/resume", label: "Resume" },
  { href: "/jobs", label: "Jobs" },
  { href: "/applications", label: "Applications" },
] as const;

export function AppNav() {
  return (
    <nav className="w-56 shrink-0 border-r bg-muted/40 flex flex-col gap-1 p-4 min-h-screen">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">
        Navigation
      </p>
      {navItems.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className="rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
