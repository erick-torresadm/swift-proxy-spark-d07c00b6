import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Globe, Monitor, Target, Building2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useCurrency } from "@/lib/currency";
import { getPublicCatalog } from "@/lib/catalog.functions";

type PlanKey = "ipv6" | "ipv4" | "fbads" | "isp";
type Billing = "monthly" | "yearly";

const SLUG_MAP: Record<PlanKey, "ipv6-br" | "ipv4-us" | "ipv6-fb-br" | "isp-us"> = {
  ipv6: "ipv6-br",
  ipv4: "ipv4-us",
  fbads: "ipv6-fb-br",
  isp: "isp-us",
};

const YEARLY_DISCOUNT = 0.175;

type PlanDef = {
  key: PlanKey;
  price: number;
  oldPrice?: number;
  Icon: typeof Globe;
  accent: "sky" | "blue" | "primary" | "amber";
  badge?: { variant: "recommended" | "premium" };
  highlightKey?: string;
};

const planDefs: PlanDef[] = [
  { key: "ipv6", price: 29.9, Icon: Globe, accent: "sky" },
  { key: "ipv4", price: 39.9, Icon: Monitor, accent: "blue" },
  { key: "fbads", price: 79.9, oldPrice: 179, Icon: Target, accent: "primary", badge: { variant: "recommended" }, highlightKey: "plans.fbads.highlight" },
  { key: "isp", price: 49.9, Icon: Building2, accent: "amber", badge: { variant: "premium" } },
];

const accentMap: Record<
  "sky" | "blue" | "primary" | "amber",
  { text: string; bg: string; ring: string }
> = {
  sky: { text: "text-sky-500", bg: "bg-sky-500/10", ring: "ring-sky-500/20" },
  blue: { text: "text-blue-500", bg: "bg-blue-500/10", ring: "ring-blue-500/20" },
  primary: { text: "text-primary", bg: "bg-primary/10", ring: "ring-primary/30" },
  amber: { text: "text-amber-500", bg: "bg-amber-500/10", ring: "ring-amber-500/20" },
};

export function Plans() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const { t } = useTranslation();
  const { parts, format } = useCurrency();

  // Live prices from DB (admin-editable). Fallback to hardcoded defaults.
  const fetchCatalog = useServerFn(getPublicCatalog);
  const { data: catalog } = useQuery({
    queryKey: ["public-catalog"],
    queryFn: () => fetchCatalog(),
    staleTime: 60_000,
  });
  const priceBySlug = new Map(
    (catalog ?? []).map((p) => [
      p.slug,
      {
        monthly: p.price_monthly_cents / 100,
        yearly: p.price_yearly_cents ? p.price_yearly_cents / 100 : null,
      },
    ]),
  );

  return (
    <section id="planos" className="py-20 md:py-28 relative overflow-hidden">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[600px] bg-gradient-hero pointer-events-none" />

      <div className="max-w-7xl mx-auto px-5 sm:px-6 relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-8"
        >
          <div className="text-primary text-xs font-bold uppercase tracking-[0.25em] mb-3">
            {t("plans.tag")}
          </div>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black mb-4 font-display leading-tight">
            {t("plans.title_1")} <span className="text-gradient">{t("plans.title_2")}</span>
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg">{t("plans.subtitle")}</p>
        </motion.div>

        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-10 sm:mb-14 flex-wrap">
          <button
            onClick={() => setBilling("monthly")}
            className={`text-sm font-semibold transition ${
              billing === "monthly" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("plans.monthly")}
          </button>
          <button
            onClick={() => setBilling(billing === "monthly" ? "yearly" : "monthly")}
            className="relative w-14 h-7 rounded-full bg-card border border-border flex items-center px-1"
            aria-label="toggle billing"
          >
            <motion.div
              className="w-5 h-5 rounded-full bg-foreground shadow-md"
              animate={{ x: billing === "yearly" ? 26 : 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`text-sm font-semibold transition ${
              billing === "yearly" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("plans.yearly")}
          </button>
          <span className="inline-flex px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wider">
            {t("plans.discount_badge")}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
          {planDefs.map((plan, i) => {
            const priceBrl = billing === "yearly" ? plan.price * (1 - YEARLY_DISCOUNT) : plan.price;
            const { symbol, int, dec } = parts(priceBrl);
            const accent = accentMap[plan.accent];
            const isFeatured = plan.badge?.variant === "recommended";
            const isPremium = plan.badge?.variant === "premium";
            const features = [
              t(`plans.${plan.key}.f1`),
              t(`plans.${plan.key}.f2`),
              t(`plans.${plan.key}.f3`),
            ];

            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                whileHover={{ y: -4 }}
                className={`relative rounded-2xl border bg-card flex flex-col pt-1 ${
                  isFeatured
                    ? "border-primary/60 shadow-[0_0_50px_-12px_hsl(var(--primary)/0.45)] lg:scale-[1.03]"
                    : "border-border"
                }`}
              >
                {plan.badge && (
                  <div
                    className={`absolute -top-1 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider whitespace-nowrap ${
                      isFeatured
                        ? "bg-primary text-primary-foreground"
                        : "bg-amber-400 text-black"
                    }`}
                  >
                    {t(`plans.badges.${plan.badge.variant}`)}
                  </div>
                )}

                <div className="p-6 sm:p-7 flex flex-col flex-1">
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ring-1 ${accent.bg} ${accent.ring}`}>
                      <plan.Icon className={`w-5 h-5 ${accent.text}`} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold leading-tight truncate">{t(`plans.${plan.key}.name`)}</h3>
                      <p className="text-xs text-muted-foreground">{t(`plans.${plan.key}.tagline`)}</p>
                    </div>
                  </div>

                  <div className="mb-1">
                    {plan.oldPrice && billing === "monthly" && (
                      <div className="text-muted-foreground line-through text-sm mb-1">
                        {t("plans.from")} {format(plan.oldPrice, { decimals: 0 })}
                      </div>
                    )}
                    <div className="flex items-baseline gap-1">
                      <span className="text-muted-foreground text-base font-semibold">{symbol}</span>
                      <span
                        className={`font-black text-5xl font-display leading-none ${
                          isFeatured ? "text-primary" : isPremium ? "text-amber-500" : "text-foreground"
                        }`}
                      >
                        {int}
                      </span>
                      <span className="text-2xl font-bold text-muted-foreground">,{dec}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {billing === "yearly" ? t("plans.per_month_yearly") : t("plans.per_month")}
                    </div>
                  </div>

                  {plan.highlightKey && (
                    <div className="mt-3 inline-block self-start px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold">
                      {t(plan.highlightKey)}
                    </div>
                  )}

                  <div className="mt-5 mb-4 text-sm text-muted-foreground">
                    <span className="text-foreground/80 font-semibold">{t("plans.ideal_for")}</span>{" "}
                    {t(`plans.${plan.key}.best_for`)}
                  </div>

                  <ul className="space-y-2.5 mb-6 border-t border-border/60 pt-5">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-sm">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center mt-0.5 shrink-0 ${accent.bg}`}>
                          <Check className={`w-3 h-3 ${accent.text}`} strokeWidth={3} />
                        </div>
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    to="/checkout"
                    search={{ plan: SLUG_MAP[plan.key], billing, qty: 1 }}
                    className={`mt-auto w-full py-3 rounded-xl font-bold text-sm text-center transition ${
                      isFeatured
                        ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow"
                        : "bg-foreground/5 text-foreground hover:bg-foreground/10 border border-border"
                    }`}
                  >
                    {isFeatured ? t("plans.cta_featured") : t("plans.cta_select")}
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          {[
            t("plans.trust.no_lock"),
            t("plans.trust.instant"),
            t("plans.trust.payments"),
            t("plans.trust.support"),
          ].map((label) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-primary" strokeWidth={3} /> {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
