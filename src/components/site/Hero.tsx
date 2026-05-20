import { motion } from "framer-motion";
import { ArrowRight, Check, Zap, ShieldCheck } from "lucide-react";
import { TerminalMock } from "./TerminalMock";

export function Hero() {
  return (
    <section
      id="inicio"
      className="relative min-h-screen flex items-center justify-center pt-32 pb-20 overflow-hidden"
    >
      {/* Animated background orbs */}
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] aspect-square aurora opacity-60 pointer-events-none" />
      <motion.div
        animate={{
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/4 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-[120px]"
      />
      <motion.div
        animate={{
          x: [0, -40, 0],
          y: [0, 40, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-1/4 -right-32 w-96 h-96 rounded-full bg-primary-glow/20 blur-[120px]"
      />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-8 bg-accent border border-primary/20"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            <span className="text-primary text-sm font-medium">
              Garantia de Reposição em Todo Plano
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="font-black text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[0.95] mb-8"
          >
            <span className="text-gradient">Proxies que</span>
            <br />
            <span className="text-foreground">Nunca</span>
            <br />
            <span className="text-gradient">Param de Funcionar</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-12 leading-relaxed"
          >
            Esqueça proxies que param no meio da campanha. Com a FastProxy você
            recebe reposição automática — sem burocracia, sem perda de tempo.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <a
              href="#planos"
              className="group relative inline-flex items-center gap-2 bg-gradient-primary text-primary-foreground font-bold px-8 py-4 rounded-2xl shadow-glow hover:shadow-elegant transition-all hover:scale-[1.02]"
            >
              Escolher meu Plano
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#beneficios"
              className="inline-flex items-center gap-2 border border-border bg-card/50 backdrop-blur text-foreground font-medium px-8 py-4 rounded-2xl hover:bg-card transition"
            >
              Como Funciona
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="flex flex-wrap justify-center gap-6 sm:gap-10 mt-16 text-sm text-muted-foreground"
          >
            {[
              { icon: Check, label: "Reposição Garantida" },
              { icon: Zap, label: "Entrega Imediata" },
              { icon: ShieldCheck, label: "Suporte 24/7" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-primary" />
                <span>{label}</span>
              </div>
            ))}
          </motion.div>

          <TerminalMock />
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 12, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 text-muted-foreground"
      >
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </motion.div>
    </section>
  );
}
