import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

type PlanType = "ipv6" | "ipv4" | "isp";

const plans: Record<
  PlanType,
  {
    name: string;
    price: number;
    description: string;
    featured?: boolean;
    features: string[];
  }
> = {
  ipv6: {
    name: "IPv6 Dedicado",
    price: 29.9,
    description: "Ideal para grandes volumes de automação e scraping.",
    features: [
      "Proxy IPv6 dedicado brasileiro",
      "HTTP e SOCKS5",
      "Entrega imediata",
      "Reposição garantida",
      "Mínimo 10 unidades",
      "Suporte 24/7",
    ],
  },
  ipv4: {
    name: "IPv4 Dedicado",
    price: 39.9,
    description: "Compatibilidade máxima com qualquer plataforma.",
    featured: true,
    features: [
      "Proxy IPv4 dedicado brasileiro",
      "HTTP e SOCKS5",
      "Entrega imediata",
      "Reposição garantida",
      "Compatível com Instagram, Google, Amazon",
      "Suporte prioritário",
    ],
  },
  isp: {
    name: "ISP Premium",
    price: 49.9,
    description: "O melhor dos dois mundos: velocidade de datacenter, confiança de ISP.",
    features: [
      "Proxy ISP residencial dedicado",
      "HTTP e SOCKS5",
      "Entrega imediata",
      "Reposição garantida",
      "Máxima confiabilidade",
      "Suporte VIP",
    ],
  },
};

export function Plans() {
  const [active, setActive] = useState<PlanType>("ipv4");
  const plan = plans[active];

  return (
    <section id="planos" className="py-24 md:py-32 relative">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[600px] bg-gradient-hero pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <div className="inline-block px-4 py-1.5 rounded-full bg-accent border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
            Planos
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            Escolha o proxy <span className="text-gradient">perfeito</span> pra você
          </h2>
          <p className="text-muted-foreground text-lg">
            Preço por unidade, sem fidelidade. Cancele quando quiser.
          </p>
        </motion.div>

        {/* Plan type toggle */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex justify-center mb-12"
        >
          <div className="inline-flex p-1.5 rounded-2xl bg-card border border-border">
            {(Object.keys(plans) as PlanType[]).map((key) => (
              <button
                key={key}
                onClick={() => setActive(key)}
                className={`relative px-6 py-2.5 rounded-xl text-sm font-bold transition uppercase ${
                  active === key
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active === key && (
                  <motion.div
                    layoutId="plan-pill"
                    className="absolute inset-0 bg-gradient-primary rounded-xl shadow-glow"
                    transition={{ type: "spring", duration: 0.5 }}
                  />
                )}
                <span className="relative">{key.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Active plan card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.97 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-2xl mx-auto"
          >
            <div
              className={`relative p-10 rounded-3xl border overflow-hidden ${
                plan.featured
                  ? "bg-gradient-to-br from-card to-accent border-primary/40 shadow-elegant"
                  : "bg-card border-border"
              }`}
            >
              {plan.featured && (
                <div className="absolute top-6 right-6 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-primary text-primary-foreground text-xs font-bold">
                  <Sparkles className="w-3 h-3" />
                  Mais Popular
                </div>
              )}

              <h3 className="text-2xl font-black mb-2">{plan.name}</h3>
              <p className="text-muted-foreground mb-8">{plan.description}</p>

              <div className="flex items-baseline gap-2 mb-8">
                <span className="text-muted-foreground text-lg">R$</span>
                <span className="text-7xl font-black text-gradient font-display">
                  {plan.price.toFixed(2).replace(".", ",")}
                </span>
                <span className="text-muted-foreground">/mês por proxy</span>
              </div>

              <ul className="space-y-3 mb-10">
                {plan.features.map((f, i) => (
                  <motion.li
                    key={f}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05 }}
                    className="flex items-start gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 shrink-0">
                      <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                    </div>
                    <span className="text-foreground">{f}</span>
                  </motion.li>
                ))}
              </ul>

              <Link
                to="/checkout"
                search={{ plan: active }}
                className="group flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-gradient-primary text-primary-foreground font-bold shadow-glow hover:shadow-elegant transition"
              >
                Contratar agora
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
