import { motion } from "framer-motion";
import { Star, Quote } from "lucide-react";

type Testimonial = {
  name: string;
  role: string;
  initials: string;
  text: string;
  rating: number;
  highlight: string;
};

const testimonials: Testimonial[] = [
  {
    name: "Rafael Monteiro",
    role: "Gestor de Tráfego — Agência Vendas+",
    initials: "RM",
    text: "Rodo Facebook Ads pra 14 contas BM e nunca mais tive bloqueio por IP. Os ISP da FastProxy salvaram nossa operação.",
    rating: 5,
    highlight: "Facebook Ads",
  },
  {
    name: "Camila Duarte",
    role: "Afiliada — Hotmart Top 5%",
    initials: "CD",
    text: "Comprei o IPv6 às 3h da manhã, em 10 segundos já estava no painel. Suporte responde no WhatsApp em minutos.",
    rating: 5,
    highlight: "Entrega imediata",
  },
  {
    name: "Tiago Albuquerque",
    role: "Dev — Automação Instagram",
    initials: "TA",
    text: "Testei Smartproxy e Bright Data antes. Preço da FastProxy é metade e a estabilidade é a mesma. Recomendo.",
    rating: 5,
    highlight: "Custo-benefício",
  },
  {
    name: "Juliana Reis",
    role: "Multi-contas Mercado Livre",
    initials: "JR",
    text: "Reposição com 1 clique no painel é diferencial. Quando um proxy cai, em segundos eu já tenho outro funcionando.",
    rating: 5,
    highlight: "Reposição automática",
  },
  {
    name: "André Lopes",
    role: "Scraping E-commerce",
    initials: "AL",
    text: "Uso 80 proxies IPv6 simultâneos pra coletar preços. Zero rate-limit, zero dor de cabeça. Painel é direto ao ponto.",
    rating: 5,
    highlight: "Alta performance",
  },
  {
    name: "Patrícia Souza",
    role: "Social Media — 30+ contas",
    initials: "PS",
    text: "Os ISP brasileiros são perfeitos pra Instagram. Nenhuma conta caiu por suspeita de proxy nos últimos 4 meses.",
    rating: 5,
    highlight: "Confiável",
  },
];

const compatibleTools = ["Multilogin", "GoLogin", "Dolphin Anty", "AdsPower", "Kameleo", "Scrapy"];

export function Testimonials() {
  return (
    <section id="depoimentos" className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[500px] bg-gradient-hero opacity-30 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <div className="text-primary text-xs font-bold uppercase tracking-[0.25em] mb-3">
            Quem usa, recomenda
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4 font-display">
            Mais de <span className="text-gradient">500 clientes</span> ativos
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">
            Agências, afiliados, devs e times de social media confiando todo dia na FastProxy.
          </p>
          <div className="flex items-center justify-center gap-1 mt-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
            ))}
            <span className="ml-2 text-sm font-semibold text-foreground">
              4.9 <span className="text-muted-foreground font-normal">(237 avaliações)</span>
            </span>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              className="relative p-6 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all group"
            >
              <Quote className="absolute top-5 right-5 w-8 h-8 text-primary/10 group-hover:text-primary/20 transition" />
              <div className="flex items-center gap-1 mb-3">
                {Array.from({ length: t.rating }).map((_, idx) => (
                  <Star key={idx} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>
              <p className="text-foreground/90 leading-relaxed mb-5 text-[15px]">"{t.text}"</p>
              <div className="flex items-center gap-3 pt-4 border-t border-border/60">
                <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                  {t.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.role}</div>
                </div>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-primary/10 text-primary">
                  {t.highlight}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-16 text-center"
        >
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground mb-5">
            Compatível com as principais ferramentas
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-foreground/60">
            {compatibleTools.map((tool) => (
              <span
                key={tool}
                className="text-base sm:text-lg font-bold tracking-tight hover:text-foreground transition"
              >
                {tool}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
