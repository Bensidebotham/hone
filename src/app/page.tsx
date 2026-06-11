import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingNav } from "@/components/landing/landing-nav";
import { Hero } from "@/components/landing/hero";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { HowItWorks } from "@/components/landing/how-it-works";
import { StatsBand } from "@/components/landing/stats-band";
import { Faq } from "@/components/landing/faq";
import { LandingFooter } from "@/components/landing/landing-footer";

export default async function Home() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");

  return (
    <div id="top" className="flex min-h-screen flex-col bg-background">
      <LandingNav />
      <main className="flex-1">
        <Hero />
        <FeatureGrid />
        <HowItWorks />
        <StatsBand />
        <Faq />
      </main>
      <LandingFooter />
    </div>
  );
}
