import { ReactNode } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, FileText, RefreshCw } from "lucide-react";

interface LegalLayoutProps {
  title: string;
  subtitle?: string;
  updatedAt: string;
  children: ReactNode;
}

const links = [
  { to: "/privacidade", label: "Privacidade", icon: ShieldCheck },
  { to: "/termos", label: "Termos de Uso", icon: FileText },
  { to: "/reembolso", label: "Reembolso", icon: RefreshCw },
] as const;

export function LegalLayout({ title, subtitle, updatedAt, children }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-5xl mx-auto px-6 pt-32 pb-20">
        <header className="mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-primary font-semibold mb-3">
            Documento Legal
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="text-muted-foreground mt-4 text-lg max-w-2xl">{subtitle}</p>
          )}
          <p className="text-sm text-muted-foreground mt-4">
            Última atualização: <span className="text-foreground">{updatedAt}</span>
          </p>
        </header>

        <nav className="flex flex-wrap gap-2 mb-12 pb-6 border-b border-border">
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <Link
                key={l.to}
                to={l.to}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm hover:bg-accent transition"
                activeProps={{ className: "bg-primary text-primary-foreground border-primary" }}
              >
                <Icon className="w-4 h-4" />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <article className="prose prose-invert max-w-none prose-headings:scroll-mt-32 prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-12 prose-h2:mb-4 prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-8 prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary">
          {children}
        </article>
      </main>
      <Footer />
    </div>
  );
}
