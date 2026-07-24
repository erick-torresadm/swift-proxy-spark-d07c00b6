import { motion } from "framer-motion";
import { Zap, ShieldCheck, RefreshCw, Globe2, Headphones, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Features() {
  const { t } = useTranslation();

  const features = [
    { icon: Zap, title: t("features.items.speed_title"), desc: t("features.items.speed_desc") },
    { icon: RefreshCw, title: t("features.items.replace_title"), desc: t("features.items.replace_desc") },
    { icon: ShieldCheck, title: t("features.items.dedicated_title"), desc: t("features.items.dedicated_desc") },
    { icon: Globe2, title: t("features.items.tech_title"), desc: t("features.items.tech_desc") },
    { icon: Headphones, title: t("features.items.support_title"), desc: t("features.items.support_desc") },
    { icon: BarChart3, title: t("features.items.panel_title"), desc: t("features.items.panel_desc") },
  ];

  return (
    <section id="beneficios" className="py-24 md:py-32 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-hero opacity-50 pointer-events-none" />
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
          <div className="inline-block px-4 py-1.5 rounded-full bg-accent border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4">
            {t("features.tag")}
          </div>
          <h2 className="text-4xl md:text-5xl font-black mb-4">
            {t("features.title_1")} <span className="text-gradient">{t("features.title_2")}</span>
          </h2>
          <p className="text-muted-foreground text-lg">{t("features.subtitle")}</p>
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
