import { motion } from "framer-motion";
import { Bot, Search, ShoppingCart, Instagram, Globe, Database, Cpu, Lock } from "lucide-react";

const items = [
  { icon: Bot, label: "Automação" },
  { icon: Search, label: "Web Scraping" },
  { icon: ShoppingCart, label: "E-commerce" },
  { icon: Instagram, label: "Social Media" },
  { icon: Globe, label: "SEO Tools" },
  { icon: Database, label: "Data Mining" },
  { icon: Cpu, label: "Bots & AI" },
  { icon: Lock, label: "Privacidade" },
];

export function Marquee() {
  const loop = [...items, ...items];
  return (
    <section
      aria-label="Casos de uso"
      className="py-12 border-y border-border bg-card/20 relative overflow-hidden"
    >
      <p className="text-center text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground mb-8">
        Construído para todo tipo de operação
      </p>

      <div className="relative">
        {/* edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent z-10" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent z-10" />

        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
          className="flex gap-12 whitespace-nowrap"
        >
          {loop.map(({ icon: Icon, label }, i) => (
            <div
              key={`${label}-${i}`}
              className="flex items-center gap-3 text-muted-foreground hover:text-primary transition-colors"
            >
              <Icon className="w-6 h-6 text-primary/70" />
              <span className="text-lg font-semibold tracking-tight">{label}</span>
              <span className="text-primary/30 text-xl">•</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
