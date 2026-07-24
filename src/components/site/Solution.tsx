import { motion } from "framer-motion";
import { X, Check } from "lucide-react";

const problems = [
  "Proxy lento ou instável",
  "Reposição lenta e burocrática",
  "Suporte que não responde",
  "Cobrança escondida e surpresas",
];

const solutions = [
  "Conexão estável e alta velocidade",
  "Reposição automática sem fricção",
  "Suporte humano em até 15 minutos",
  "Preço claro, sem letras miúdas",
];

export function Solution() {
  return (
    <section id="solucao" className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-40 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-background to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            De problema a <span className="text-gradient">solução</span>
          </h2>
          <p className="text-muted-foreground text-lg">
            A diferença entre perder vendas e dominar o mercado.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 rounded-3xl bg-destructive/5 border border-destructive/20"
          >
            <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 bg-destructive/10 text-destructive">
              Antes
            </div>
            <h3 className="font-bold text-2xl text-destructive mb-6">O Problema</h3>
            <ul className="space-y-4">
              {problems.map((p, i) => (
                <motion.li
                  key={p}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
                  className="flex items-start gap-3"
                >
                  <X className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{p}</span>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 rounded-3xl bg-accent border border-primary/30 relative overflow-hidden"
          >
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
            <div className="relative">
              <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-4 bg-primary/15 text-primary">
                Depois
              </div>
              <h3 className="font-bold text-2xl text-primary mb-6">A Solução FastProxy</h3>
              <ul className="space-y-4">
                {solutions.map((s, i) => (
                  <motion.li
                    key={s}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
                    className="flex items-start gap-3"
                  >
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center mt-0.5 shrink-0">
                      <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                    </div>
                    <span className="text-foreground">{s}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
