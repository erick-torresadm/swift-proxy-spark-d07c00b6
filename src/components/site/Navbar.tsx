import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Menu, X, LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "./ThemeToggle";
import { LangCurrencyMenu } from "./LangCurrencyMenu";
import logo from "@/assets/logo-fastproxy.png";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const links = [
    { href: "/#planos", label: t("nav.plans") },
    { href: "/pacotes", label: "Pacotes" },
    { href: "/#anunciantes", label: "Anunciantes" },
    { href: "/blog", label: t("nav.blog") },
    { href: "/#faq", label: t("nav.faq") },
  ];


  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.header
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="fixed inset-x-0 z-50 px-3 sm:px-6 pointer-events-none"
        style={{ top: "calc(env(safe-area-inset-top) + 0.5rem)" }}
      >
        <motion.div
          animate={{
            maxWidth: scrolled ? 980 : 1200,
            paddingLeft: scrolled ? 14 : 20,
            paddingRight: scrolled ? 14 : 20,
          }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className={`pointer-events-auto mx-auto h-14 sm:h-16 flex items-center justify-between rounded-full border backdrop-blur-2xl transition-colors ${
            scrolled
              ? "bg-background/70 border-border/70 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.2)]"
              : "bg-background/40 border-border/40 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.15)]"
          }`}
        >
          <Link to="/" className="flex items-center shrink-0">
            <img src={logo} alt="FastProxy" className="h-6 sm:h-7 brightness-0 dark:brightness-100 transition" />
          </Link>

          <nav className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 rounded-full transition"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-1 shrink-0">
            <ThemeToggle className="scale-90" />
            <LangCurrencyMenu className="scale-90" />
            {loading ? (
              <div className="w-24 h-9 rounded-full bg-card animate-pulse ml-2" />
            ) : user ? (
              <Link
                to="/dashboard"
                className="ml-2 px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-glow hover:bg-primary/90 transition flex items-center gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                {t("nav.dashboard")}
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="ml-2 px-4 py-2 rounded-full text-sm font-semibold text-foreground hover:bg-foreground/5 transition"
                >
                  {t("nav.login")}
                </Link>
                <Link
                  to="/signup"
                  className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm font-bold shadow-glow hover:bg-primary/90 transition"
                >
                  {t("nav.signup")}
                </Link>
              </>
            )}
          </div>

          <div className="md:hidden flex items-center gap-1">
            <ThemeToggle className="scale-90" />
            <LangCurrencyMenu className="scale-90" />
            <button
              onClick={() => setOpen(!open)}
              className="p-2 rounded-full hover:bg-foreground/5 transition"
              aria-label="Menu"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </motion.div>

        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2 }}
            className="md:hidden pointer-events-auto mt-2 mx-auto max-w-[560px] rounded-3xl bg-background/85 backdrop-blur-2xl border border-border/70 shadow-[0_12px_48px_-12px_rgba(0,0,0,0.3)] overflow-hidden"
          >
            <div className="px-3 py-3 space-y-1">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5"
                >
                  {l.label}
                </a>
              ))}
              <div className="pt-2 border-t border-border/60 mt-2 space-y-2">
                <Link
                  to="/checkout"
                  onClick={() => setOpen(false)}
                  className="block w-full text-center py-2.5 rounded-full bg-gradient-primary text-primary-foreground text-sm font-bold shadow-glow"
                >
                  Comprar agora
                </Link>
                {user ? (
                  <Link
                    to="/dashboard"
                    onClick={() => setOpen(false)}
                    className="block w-full text-center py-2.5 rounded-full border border-border text-sm font-semibold"
                  >
                    {t("nav.dashboard")}
                  </Link>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setOpen(false)}
                      className="block w-full text-center py-2.5 rounded-full border border-border text-sm font-semibold"
                    >
                      {t("nav.login")}
                    </Link>
                    <Link
                      to="/signup"
                      onClick={() => setOpen(false)}
                      className="block w-full text-center py-2.5 rounded-full bg-foreground/5 text-foreground text-sm font-semibold border border-border"
                    >
                      {t("nav.signup")}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </motion.header>
    </>
  );
}
