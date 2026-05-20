import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe, Monitor, Target, Building2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

type PlanKey = "ipv6" | "ipv4" | "fbads" | "isp";
type Billing = "monthly" | "yearly";

const YEARLY_DISCOUNT = 0.175;

const plans: {
  key: PlanKey;
  name: string;
  price: number;
  oldPrice?: number;
  description: string;
  features: string[];
  Icon: typeof Globe;
  iconColor: string;
  badge?: { label: string; variant: "recommended" | "premium" };
  highlight?: string;
}[] = [
  {
    key: "ipv6",
    name: "Proxy IPv6",
    price: 29.9,
    description: "Econômico e eficiente para escala.",
    features: ["HTTP/S e SOCKS5", "Entrega Instantânea"],
    Icon: Globe,
    iconColor: "text-sky-400",
  },
  {
    key: "ipv4",
    name: "IPv4 Dedicado",
    price: 39.9,
    description: "IP exclusivo de alta performance.",
    features: ["IP Dedicado Exclusivo", "Banda Ilimitada"],
    Icon: Monitor,
    iconColor: "text-blue-400",
  },
  {
    key: "fbads",
    name: "IPv6 p/ Facebook Ads",
    price: 79.9,
    oldPrice: 179,
    description: "Foco total em contingência profissional.",
    highlight: "1 PROXY + 10 TROCAS GRATUITAS",
    features: ["10 Rotações de IP", "Alta Compatibilidade"],
    Icon: Target,
    iconColor: "text-primary",
    badge: { label: "Recomendado", variant: "recommended" },
  },
  {
    key: "isp",
    name: "Proxy ISP",
    price: 49.9,
    description: "IP Residencial puro e indetectável.",
    features: ["Velocidade 100Mbps", "Residencial Genuíno"],
    Icon: Building2,
    iconColor: "text-amber-400",
    badge: { label: "Premium", variant: "premium" },
  },
];

function formatPrice(price: number, billing: Billing) {
  const value = billing === "yearly" ? price * (1 - YEARLY_DISCOUNT) : price;
  const [int, dec] = value.toFixed(2).split(".");
  return { int, dec };
}

export function Plans() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <section id="planos" className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[600px] bg-gradient-hero pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-10"
        >
          <div className="text-primary text-xs font-bold uppercase tracking-[0.3em] mb-4">
            Tabela de Preços
          </div>
          <h2 className="text-5xl md:text-6xl font-black mb-4 font-display">
            Escolha o seu <span className="text-gradient">Poder</span>
          </h2>
        </motion.div>

        {/* Billing toggle */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex items-center justify-center gap-4 mb-14"
        >
          <span
            className={`text-sm font-bold ${
              billing === "monthly" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Mensal
          </span>
          <button
            onClick={() => setBilling(billing === "monthly" ? "yearly" : "monthly")}
            className="relative w-14 h-7 rounded-full bg-card border border-border flex items-center px-1"
            aria-label="Alternar cobrança"
          >
            <motion.div
              className="w-5 h-5 rounded-full bg-foreground shadow-md"
              animate={{ x: billing === "yearly" ? 26 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
          <span
            className={`text-sm font-bold ${
              billing === "yearly" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Anual
          </span>
          <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wider">
            Economize 17,5%
          </span>
        </motion.div>

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan, i) => {
            const { int, dec } = formatPrice(plan.price, billing);
            const isFeatured = plan.badge?.variant === "recommended";
            const isPremium = plan.badge?.variant === "premium";

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                whileHover={{ y: -6 }}
                className={`relative rounded-3xl border p-7 flex flex-col overflow-hidden bg-gradient-to-b from-card to-background ${
                  isFeatured
                    ? "border-primary/60 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.5)]"
                    : "border-border"
                }`}
              >
                {/* Glow blob */}
                <div
                  className={`absolute top-6 right-6 w-16 h-16 rounded-full blur-2xl opacity-60 ${
                    isFeatured
                      ? "bg-primary"
                      : isPremium
                        ? "bg-amber-400"
                        : plan.key === "ipv4"
                          ? "bg-blue-500"
                          : "bg-sky-500"
                  }`}
                />

                {/* Badge */}
                {plan.badge && (
                  <div
                    className={`absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      isFeatured
                        ? "bg-primary text-primary-foreground"
                        : "bg-amber-400 text-black"
                    }`}
                  >
                    {plan.badge.label}
                  </div>
                )}

                <div className="relative pt-6 flex flex-col items-center text-center flex-1">
                  <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center mb-5">
                    <plan.Icon className={`w-7 h-7 ${plan.iconColor}`} strokeWidth={2} />
                  </div>

                  <h3 className="text-xl font-black mb-4 min-h-[3.5rem] flex items-center">
                    {plan.name}
                  </h3>

                  <div className="mb-2">
                    {plan.oldPrice && billing === "monthly" && (
                      <span className="text-muted-foreground line-through text-sm mr-2">
                        R${plan.oldPrice}
                      </span>
                    )}
                    <span className="text-foreground font-black text-2xl">R$ </span>
                    <span
                      className={`font-black text-5xl font-display ${
                        isFeatured
                          ? "text-primary"
                          : isPremium
                            ? "text-amber-400"
                            : "text-foreground"
                      }`}
                    >
                      {int}
                    </span>
                    <span
                      className={`font-black text-2xl ${
                        isFeatured
                          ? "text-primary"
                          : isPremium
                            ? "text-amber-400"
                            : "text-foreground"
                      }`}
                    >
                      ,{dec}
                    </span>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-4">
                    Unidade / {billing === "yearly" ? "Ano" : "Mês"}
                  </div>

                  {plan.highlight && (
                    <div className="text-primary text-xs font-bold uppercase tracking-wide mb-4">
                      {plan.highlight}
                    </div>
                  )}

                  <p className="text-muted-foreground text-sm mb-6 px-2">
                    {plan.description}
                  </p>

                  <div className="w-full border-t border-border/60 pt-5 space-y-3 mb-6">
                    {plan.features.map((f, idx) => (
                      <div key={f} className="flex items-center justify-center gap-2 text-sm">
                        {isFeatured && idx === 0 ? (
                          <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                          </div>
                        ) : null}
                        <span className="text-foreground/90">{f}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    to="/checkout"
                    search={{ plan: plan.key }}
                    className={`mt-auto w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider transition ${
                      isFeatured
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
                        : "bg-transparent text-foreground hover:bg-card border border-transparent hover:border-border"
                    }`}
                  >
                    {isFeatured ? "Comprar Agora" : "Selecionar"}
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
