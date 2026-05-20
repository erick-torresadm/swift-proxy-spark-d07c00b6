import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo-fastproxy.png";

const links = [
  { href: "/#planos", label: "Planos" },
  { href: "/#recursos", label: "Recursos" },
  { href: "/#faq", label: "FAQ" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 inset-x-0 z-50 transition-all ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/60"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img src={logo} alt="FastProxy" className="h-7" />
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {loading ? (
            <div className="w-24 h-9 rounded-xl bg-card animate-pulse" />
          ) : user ? (
            <Link
              to="/dashboard"
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-glow hover:bg-primary/90 transition flex items-center gap-2"
            >
              <LayoutDashboard className="w-4 h-4" />
              Meu painel
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="px-4 py-2 rounded-xl text-sm font-semibold text-foreground hover:bg-card transition"
              >
                Entrar
              </Link>
              <Link
                to="/signup"
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow-glow hover:bg-primary/90 transition"
              >
                Criar conta
              </Link>
            </>
          )}
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 rounded-lg hover:bg-card transition"
          aria-label="Menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="md:hidden bg-background/95 backdrop-blur-xl border-b border-border"
        >
          <div className="px-5 py-4 space-y-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="block py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
            <div className="pt-3 border-t border-border mt-3 space-y-2">
              {user ? (
                <Link
                  to="/dashboard"
                  onClick={() => setOpen(false)}
                  className="block w-full text-center py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
                >
                  Meu painel
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="block w-full text-center py-2.5 rounded-xl border border-border text-sm font-semibold"
                  >
                    Entrar
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setOpen(false)}
                    className="block w-full text-center py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold"
                  >
                    Criar conta
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}
