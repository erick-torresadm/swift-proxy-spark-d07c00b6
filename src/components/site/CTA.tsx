import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/lib/currency";

export function CTA() {
  const { t } = useTranslation();
  const { format } = useCurrency();
  return (
    <section className="py-24 md:py-32">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-[2.5rem] p-12 md:p-20 text-center border border-primary/30 bg-gradient-to-br from-card via-accent to-card"
        >
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-primary/20 rounded-full blur-[120px]" />
          <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-primary-glow/20 rounded-full blur-[120px]" />

          <div className="relative">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-4xl md:text-6xl font-black mb-6"
            >
              {t("cta.title_1")} <span className="text-gradient">{t("cta.title_2")}</span> {t("cta.title_3")}
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            >
              {t("cta.subtitle")}
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex flex-col sm:flex-row gap-3 justify-center"
            >
              <Link
                to="/signup"
                className="group inline-flex items-center justify-center gap-2 bg-gradient-primary text-primary-foreground font-bold px-8 py-4 rounded-2xl shadow-glow hover:shadow-elegant transition"
              >
                {t("cta.primary")} — {format(29.9)}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#planos"
                className="inline-flex items-center justify-center gap-2 border border-border bg-card/50 backdrop-blur text-foreground font-medium px-8 py-4 rounded-2xl hover:bg-card transition"
              >
                {t("cta.secondary")}
              </a>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
