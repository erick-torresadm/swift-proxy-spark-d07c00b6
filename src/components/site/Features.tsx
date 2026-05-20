import { motion } from "framer-motion";
import { Zap, ShieldCheck, RefreshCw, Globe2, Headphones, BarChart3 } from "lucide-react";

const features = [
  {
    icon: Zap,
    title: "Velocidade Real",
    desc: "Infraestrutura otimizada para scraping, automação e bots. Conexão estável mesmo em alto volume.",
  },
  {
    icon: RefreshCw,
    title: "Reposição Automática",
    desc: "Proxy bloqueado? Substituímos sem você precisar abrir chamado. Garantia em todo plano.",
  },
  {
    icon: ShieldCheck,
    title: "Dedicado e Anônimo",
    desc: "IPs exclusivos seus. Sem compartilhamento, sem rastro, sem risco de banimento por outros.",
  },
  {
    icon: Globe2,
    title: "IPv6, IPv4 e ISP",
    desc: "Três tecnologias para encaixar no seu caso de uso — do mais barato ao mais compatível.",
  },
  {
    icon: Headphones,
    title: "Suporte 24/7",
    desc: "Time humano que entende de proxy. Resposta em até 15 minutos no plano VIP.",
  },
  {
    icon: BarChart3,
    title: "Painel Completo",
    desc: "Acompanhe seus proxies, faturas e regeneração de IP em tempo real. Tudo num só lugar.",
  },
];

export function Features() {
  return (
    <section id="beneficios" className="py-24 md:py-32 relative">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="inline-block px-4 py-1.5 rounded-full bg-accent border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
            Benefícios
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            Tudo que você precisa,{" "}
            <span className="text-gradient">nada que atrapalha</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            Construído para quem leva automação a sério.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className="group relative p-8 rounded-3xl bg-card border border-border hover:border-primary/30 transition-all overflow-hidden"
            >
              <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative">
                <div className="w-14 h-14 rounded-2xl bg-gradient-primary flex items-center justify-center mb-5 shadow-glow">
                  <f.icon className="w-7 h-7 text-primary-foreground" strokeWidth={2.2} />
                </div>
                <h3 className="text-xl font-bold mb-2">{f.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
