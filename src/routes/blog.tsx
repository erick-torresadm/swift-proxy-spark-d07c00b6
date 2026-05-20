import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/blog")({
  component: BlogLayout,
});

function BlogLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pt-28 sm:pt-32 pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="mb-8">
            <Link
              to="/blog"
              className="inline-block text-xs uppercase tracking-widest text-primary font-bold mb-2"
            >
              Blog
            </Link>
          </div>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}
