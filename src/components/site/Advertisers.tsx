import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { Target, Layers, ShieldCheck, ArrowRight, Sparkles } from "lucide-react";

const FEATURES = [
  {
    Icon: Layers,
    title: "Multi-contas sem cruzamento",
    desc: "Um IP dedicado e exclusivo por perfil. Compatível com AdsPower, Dolphin Anty, Multilogin e GoLogin.",
  },
  {
    Icon: ShieldCheck,
    title: "BMs limpas, sem bloqueio",
    desc: "Pool de IPs novos, nunca reusados por outros clientes. Reduz drasticamente o risco do Meta queimar sua BM.",
  },
  {
    Icon: Sparkles,
    title: "Escala sem dor de cabeça",
    desc: "Rode dezenas de contas de teste em paralelo. Reposição automática se algum IP cair.",
  },
];

const TOOLS = ["AdsPower", "Dolphin Anty", "Multilogin", "GoLogin", "Vision", "Indigo"];

export function Advertisers() {
  return (
    <section
      id="anunciantes"
      aria-labelledby="anunciantes-title"
      className="relative py-24 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      <div className="relative max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-3xl mx-auto mb-14"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-6">
            <Target className="w-4 h-4" />
            Proxy pra anunciantes
          </div>
          <h2
            id="anunciantes-title"
            className="font-black text-3xl sm:text-4xl lg:text-5xl leading-tight mb-5"
          >
            Proxy pra <span className="text-gradient">Facebook Ads</span>, Google Ads e
            multi-contas
          </h2>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Se você gerencia BMs, escala criativos ou roda múltiplas contas de anúncio,
            precisa de IPs limpos, dedicados e que o Meta não detecte como datacenter.
            A FastProxy entrega exatamente isso — com reposição automática e suporte
            especializado em tráfego pago.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-3xl border border-border bg-card p-6"
            >
              <div className="inline-flex p-2.5 rounded-xl bg-primary/10 text-primary mb-4">
                <f.Icon className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="rounded-3xl border border-border bg-card/40 backdrop-blur p-6 sm:p-8 mb-10">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">
            Compatível com os principais antidetect browsers
          </p>
          <div className="flex flex-wrap gap-2">
            {TOOLS.map((t) => (
              <span
                key={t}
                className="px-3 py-1.5 rounded-full bg-foreground/5 border border-border text-sm font-medium text-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/proxy-facebook-ads"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-gradient-primary text-primary-foreground text-sm font-bold shadow-glow hover:opacity-90 transition"
          >
            Ver proxy pra Facebook Ads
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/proxy-isp"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-border bg-card text-foreground text-sm font-semibold hover:bg-secondary transition"
          >
            Ver proxy residencial (ISP)
          </Link>
        </div>
      </div>
    </section>
  );
}
