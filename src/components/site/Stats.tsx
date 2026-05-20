import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useRef } from "react";

const stats = [
  { value: 50, suffix: "K+", label: "Proxies entregues" },
  { value: 500, suffix: "+", label: "Clientes ativos" },
  { value: 99.9, suffix: "%", label: "Uptime dos proxies", decimals: 1 },
  { value: 24, suffix: "/7", label: "Suporte online" },
];

function Counter({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => v.toFixed(decimals));

  useEffect(() => {
    if (inView) {
      const controls = animate(count, to, { duration: 2, ease: "easeOut" });
      return () => controls.stop();
    }
  }, [inView, to, count]);

  useEffect(() => {
    return rounded.on("change", (v) => {
      if (ref.current) ref.current.textContent = v;
    });
  }, [rounded]);

  return <span ref={ref}>0</span>;
}

export function Stats() {
  return (
    <section className="py-20 border-y border-border bg-card/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="text-4xl md:text-6xl font-black text-gradient font-display">
                <Counter to={s.value} decimals={s.decimals} />
                {s.suffix}
              </div>
              <p className="text-sm mt-2 text-muted-foreground">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
