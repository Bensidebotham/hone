import { AppNav } from "@/components/app-nav";
import { PageTransition } from "@/components/page-transition";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AppNav />
      <main className="flex-1 p-8">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
