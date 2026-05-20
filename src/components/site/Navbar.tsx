import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import logo from "@/assets/logo-fastproxy.png";

const links = [
  { href: "#inicio", label: "Início" },
  { href: "#beneficios", label: "Benefícios" },
  { href: "#planos", label: "Planos" },
  { href: "#faq", label: "FAQ" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.nav
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-6xl rounded-2xl px-6 py-3 transition-all duration-300 ${
          scrolled ? "glass shadow-card" : "bg-transparent"
        }`}
      >
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="FastProxy" className="h-9 w-auto" />
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors relative group"
              >
                {l.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-primary group-hover:w-full transition-all duration-300" />
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden md:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
            >
              Entrar
            </Link>
            <Link
              to="/signup"
              className="hidden md:inline-flex text-sm font-bold bg-gradient-primary text-primary-foreground rounded-xl px-5 py-2.5 hover:opacity-90 transition shadow-glow"
            >
              Começar
            </Link>
            <button
              onClick={() => setOpen(true)}
              className="lg:hidden p-2 rounded-lg text-foreground"
              aria-label="Abrir menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] lg:hidden"
          >
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-card border-l border-border p-6 flex flex-col"
            >
              <div className="flex items-center justify-between mb-10">
                <img src={logo} alt="FastProxy" className="h-8" />
                <button onClick={() => setOpen(false)} className="p-2" aria-label="Fechar">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="text-lg font-medium py-4 px-4 rounded-xl hover:bg-secondary transition"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
              <div className="mt-auto pt-6 border-t border-border flex flex-col gap-3">
                <Link
                  to="/login"
                  onClick={() => setOpen(false)}
                  className="w-full text-center py-3 rounded-xl border border-border font-medium"
                >
                  Entrar
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setOpen(false)}
                  className="w-full text-center py-3 rounded-xl bg-gradient-primary text-primary-foreground font-bold"
                >
                  Começar agora
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
