import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const lines = [
  { prompt: "$", text: "curl -x proxy.fastproxy.com.br:8080 https://api.target.com", color: "text-foreground" },
  { prompt: ">", text: "200 OK · 142ms · BR-SP", color: "text-primary" },
  { prompt: "$", text: "fastproxy rotate --plan ipv4", color: "text-foreground" },
  { prompt: ">", text: "✓ Novo IP atribuído: 187.45.xxx.xxx", color: "text-primary" },
  { prompt: ">", text: "✓ Reposição automática ativa", color: "text-primary-glow" },
];

export function TerminalMock() {
  const [visible, setVisible] = useState(0);

  useEffect(() => {
    if (visible >= lines.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), 700);
    return () => clearTimeout(t);
  }, [visible]);

  useEffect(() => {
    if (visible >= lines.length) {
      const t = setTimeout(() => setVisible(0), 3500);
      return () => clearTimeout(t);
    }
  }, [visible]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative max-w-2xl mx-auto mt-16"
    >
      {/* glow */}
      <div className="absolute -inset-4 bg-gradient-primary opacity-20 blur-2xl rounded-3xl" />

      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative rounded-2xl border border-border bg-card/90 backdrop-blur shadow-elegant overflow-hidden"
      >
        {/* header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background/40">
          <span className="w-3 h-3 rounded-full bg-destructive/70" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <span className="w-3 h-3 rounded-full bg-primary/70" />
          <span className="ml-3 text-xs text-muted-foreground font-mono">
            fastproxy ~ terminal
          </span>
        </div>

        {/* body */}
        <div className="p-6 font-mono text-sm md:text-[15px] text-left min-h-[200px]">
          {lines.slice(0, visible).map((l, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="flex gap-3 mb-2"
            >
              <span className="text-primary/60 select-none">{l.prompt}</span>
              <span className={l.color}>{l.text}</span>
            </motion.div>
          ))}
          {visible < lines.length && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.9, repeat: Infinity }}
              className="inline-block w-2 h-4 bg-primary align-middle ml-1"
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
