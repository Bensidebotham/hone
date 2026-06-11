import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingNav } from "@/components/landing/landing-nav";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <div id="top" className="flex min-h-screen flex-col bg-background">
      <LandingNav />
      <main className="flex-1">
        <p className="mx-auto max-w-6xl px-6 py-24 text-muted-foreground">
          Landing sections go here.
        </p>
      </main>
    </div>
  );
}
