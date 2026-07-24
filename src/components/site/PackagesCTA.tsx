import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Package, Sparkles, ShieldCheck, Infinity as InfinityIcon, Zap } from "lucide-react";

export function PackagesCTA() {
  return (
    <section className="py-16 md:py-20 relative">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/5 via-card to-card p-6 sm:p-10 relative overflow-hidden"
        >
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative grid md:grid-cols-2 gap-8 items-center">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wide mb-3">
                <Sparkles className="w-3 h-3" /> Novidade · Pagamento único
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black leading-tight mb-3 font-display">
                Prefere pagar <span className="text-gradient">uma vez só?</span>
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg mb-5">
                Pacotes prépagos de IPv6 brasileiros próprios. Escolha quantos IPs e por quanto tempo — pague à vista e esqueça a renovação. Quanto mais volume e prazo, maior o desconto.
              </p>

              <ul className="space-y-2 mb-6 text-sm">
                <li className="flex items-center gap-2">
                  <InfinityIcon className="w-4 h-4 text-primary" />
                  <span>IPv6 brasileiros próprios · estoque ilimitado</span>
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  <span>Ativação imediata após pagamento</span>
                </li>
                <li className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" />
                  <span>Substituição gratuita · sem renovação automática</span>
                </li>
              </ul>

              <Link
                to="/pacotes"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black text-sm shadow-glow hover:opacity-90 transition"
              >
                <Package className="w-4 h-4" /> Ver pacotes prépagos
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              {[
                { qty: "5 IPs", term: "3 meses", off: "-15%", badge: "Mais vendido" },
                { qty: "10 IPs", term: "6 meses", off: "-25%", badge: "Recomendado" },
                { qty: "25 IPs", term: "12 meses", off: "-40%", badge: "Melhor custo" },
                { qty: "50 IPs", term: "12 meses", off: "-45%" },
              ].map((c) => (
                <div
                  key={c.qty + c.term}
                  className="relative rounded-2xl border border-border bg-background/50 p-4 hover:border-primary/50 transition"
                >
                  {c.badge && (
                    <div className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-black uppercase tracking-wider">
                      {c.badge}
                    </div>
                  )}
                  <div className="font-black text-lg">{c.qty}</div>
                  <div className="text-xs text-muted-foreground">por {c.term}</div>
                  <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 text-[11px] font-black">
                    {c.off}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
