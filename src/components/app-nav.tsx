"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserRound,
  Briefcase,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Extra path prefixes that should also mark this item active (e.g. deep routes).
  match?: string[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/applications", label: "Applications", icon: ClipboardList },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: UserRound, match: ["/resume"] },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="w-60 shrink-0 border-r border-border bg-sidebar flex flex-col gap-1 p-4 min-h-screen">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-3 mb-4">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary text-primary-foreground text-sm font-extrabold shadow-sm">
          H
        </span>
        <span className="text-lg font-extrabold tracking-tight">Hone</span>
        <span className="h-1.5 w-1.5 rounded-full bg-highlight" aria-hidden="true" />
      </Link>

      {navItems.map(({ href, label, icon: Icon, match }) => {
        const matches = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
        const active = matches(href) || (match?.some(matches) ?? false);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {active && (
              <span
                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-highlight"
                aria-hidden="true"
              />
            )}
            <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
