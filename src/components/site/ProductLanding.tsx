import { motion } from "framer-motion";
import { ArrowRight, Check, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { CTA } from "./CTA";
import { Testimonials } from "./Testimonials";
import { FAQ } from "./FAQ";
import { WhatsAppFloat } from "./WhatsAppFloat";
import { whatsappUrl } from "@/config/contact";

export type ProductLandingProps = {
  slug: "ipv6-br" | "ipv4-us" | "isp-us" | "ipv6-fb-br";
  badge: string;
  title: React.ReactNode;
  subtitle: string;
  Icon: LucideIcon;
  bullets: string[];
  useCases: { title: string; desc: string }[];
  priceFrom: string;
  whatsappMessage: string;
};

export function ProductLanding(props: ProductLandingProps) {
  const {
    slug,
    badge,
    title,
    subtitle,
    Icon,
    bullets,
    useCases,
    priceFrom,
    whatsappMessage,
  } = props;

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] aspect-square aurora opacity-40 pointer-events-none" />

          <div className="max-w-7xl mx-auto px-6 relative">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-6">
                  <Icon className="w-4 h-4" />
                  {badge}
                </div>
                <h1 className="font-black text-4xl sm:text-5xl lg:text-6xl leading-[1.05] mb-6">
                  {title}
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-xl">
                  {subtitle}
                </p>

                <ul className="space-y-2.5 mb-8">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-foreground/90">
                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center mt-0.5 shrink-0">
                        <Check className="w-3 h-3 text-primary" strokeWidth={3} />
                      </div>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    to="/checkout"
                    search={{ plan: slug, billing: "monthly", qty: 1 }}
                    className="group inline-flex items-center justify-center gap-2 bg-gradient-primary text-primary-foreground font-bold px-7 py-4 rounded-2xl shadow-glow hover:shadow-elegant transition"
                  >
                    Comprar agora — a partir de {priceFrom}
                    <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <a
                    href={whatsappUrl(whatsappMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 border border-border bg-card/50 backdrop-blur text-foreground font-medium px-7 py-4 rounded-2xl hover:bg-card transition"
                  >
                    Falar no WhatsApp
                  </a>
                </div>

                <div className="flex items-center gap-5 mt-8 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-primary" /> Entrega imediata
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary" /> Garantia 7 dias
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.15 }}
                className="relative flex justify-center"
              >
                <div className="relative w-full max-w-md aspect-square rounded-3xl bg-gradient-to-br from-card via-accent to-card border border-primary/20 p-8 flex items-center justify-center">
                  <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
                  <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-primary-glow/20 rounded-full blur-3xl" />
                  <div className="relative w-32 h-32 rounded-3xl bg-gradient-primary flex items-center justify-center shadow-glow">
                    <Icon className="w-16 h-16 text-primary-foreground" strokeWidth={1.8} />
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="py-20 md:py-28">
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <div className="text-primary text-xs font-bold uppercase tracking-[0.25em] mb-3">
                Casos de uso
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black mb-4">
                Pra quem foi <span className="text-gradient">feito</span>
              </h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {useCases.map((uc, i) => (
                <motion.div
                  key={uc.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="p-7 rounded-2xl bg-card border border-border hover:border-primary/30 transition"
                >
                  <h3 className="font-bold text-lg mb-2">{uc.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-[15px]">{uc.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
