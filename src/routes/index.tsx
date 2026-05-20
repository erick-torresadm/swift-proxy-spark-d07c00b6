import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { Stats } from "@/components/site/Stats";
import { Solution } from "@/components/site/Solution";
import { Features } from "@/components/site/Features";
import { Plans } from "@/components/site/Plans";
import { FAQ } from "@/components/site/FAQ";
import { CTA } from "@/components/site/CTA";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Solution />
        <Features />
        <Plans />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
