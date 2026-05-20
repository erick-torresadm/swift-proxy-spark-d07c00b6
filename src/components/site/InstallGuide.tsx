import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import {
  Smartphone,
  ArrowDownToLine,
  Share2,
  PlusSquare,
  Chrome,
  Apple,
  CheckCircle2,
  Bell,
  Gauge,
  MousePointerClick,
} from "lucide-react";

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
  },
};

const phoneVariants = {
  hidden: { opacity: 0, scale: 0.92, y: 40 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.34, 1.56, 0.64, 1] },
  },
};

function AndroidSteps() {
  const steps = [
    {
      icon: Chrome,
      label: "Abra o Chrome",
      desc: "Acesse fastproxy.com no navegador Chrome.",
    },
    {
      icon: ArrowDownToLine,
      label: "Toque no menu",
      desc: 'Clique nos três pontinhos (⋮) no canto superior direito.',
    },
    {
      icon: PlusSquare,
      label: "Adicionar à tela",
      desc: 'Selecione "Adicionar à tela inicial" ou "Instalar app".',
    },
    {
      icon: CheckCircle2,
      label: "Pronto!",
      desc: "O ícone do FastProxy aparece no seu launcher.",
    },
  ];
  return (
    <ol className="space-y-5">
      {steps.map((s, i) => (
        <motion.li
          key={i}
          variants={itemVariants}
          className="flex items-start gap-4"
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
            <s.icon className="w-5 h-5 text-primary" />
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center border border-background">
              {i + 1}
            </span>
          </div>
          <div>
            <p className="font-semibold text-sm">{s.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

function iOSSteps() {
  const steps = [
    {
      icon: Apple,
      label: "Abra o Safari",
      desc: "Acesse fastproxy.com pelo Safari (iPhone/iPad).",
    },
    {
      icon: Share2,
      label: "Toque em Compartilhar",
      desc: 'Clique no ícone de compartilhar na barra inferior.',
    },
    {
      icon: ArrowDownToLine,
      label: "Adicionar à Tela de Início",
      desc: 'Deslize e toque em "Adicionar à Tela de Início".',
    },
    {
      icon: CheckCircle2,
      label: "Pronto!",
      desc: "O ícone do FastProxy aparece na sua home screen.",
    },
  ];
  return (
    <ol className="space-y-5">
      {steps.map((s, i) => (
        <motion.li
          key={i}
          variants={itemVariants}
          className="flex items-start gap-4"
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
            <s.icon className="w-5 h-5 text-primary" />
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center border border-background">
              {i + 1}
            </span>
          </div>
          <div>
            <p className="font-semibold text-sm">{s.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
          </div>
        </motion.li>
      ))}
    </ol>
  );
}

export function InstallGuide() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const [activeTab, setActiveTab] = useState<"android" | "ios">("android");

  return (
    <section
      id="instalar"
      ref={ref}
      className="relative py-24 md:py-32 overflow-hidden"
    >
      {/* subtle background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[60%] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="text-center mb-14"
        >
          <motion.div
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold mb-5"
          >
            <Smartphone className="w-3.5 h-3.5" />
            APP NATIVO
          </motion.div>
          <motion.h2
            variants={itemVariants}
            className="text-3xl md:text-5xl font-bold tracking-tight mb-4"
          >
            Instale o{" "}
            <span className="text-gradient">FastProxy</span> no celular
          </motion.h2>
          <motion.p
            variants={itemVariants}
            className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base"
          >
            Transforme o site em um app de verdade. Acesso rápido, notificações
            push e badge de expiração — sem precisar da Play Store ou App Store.
          </motion.p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: phone mockup */}
          <motion.div
            variants={phoneVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            className="order-2 md:order-1 flex justify-center"
          >
            <div className="relative w-[260px] h-[520px] rounded-[2.5rem] border-[6px] border-white/10 bg-card shadow-card overflow-hidden">
              {/* notch */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-black/80 rounded-b-2xl z-20" />
              {/* status bar */}
              <div className="absolute top-1.5 left-4 right-4 flex justify-between items-center z-10 text-[10px] text-foreground/70 font-medium">
                <span>9:41</span>
                <div className="flex gap-1">
                  <Gauge className="w-3 h-3" />
                  <Bell className="w-3 h-3" />
                </div>
              </div>
              {/* screen content */}
              <div className="pt-10 px-4 pb-4 h-full flex flex-col">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                    <ZapIcon />
                  </div>
                  <span className="font-bold text-sm">FastProxy</span>
                </div>
                <div className="space-y-2 mb-4">
                  {[
                    { label: "Proxy Brasil", sub: "Expira em 12 dias" },
                    { label: "Proxy EUA", sub: "Expira em 3 dias" },
                    { label: "Proxy UK", sub: "Expira amanhã" },
                  ].map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border"
                    >
                      <div>
                        <p className="text-xs font-semibold">{p.label}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {p.sub}
                        </p>
                      </div>
                      <MousePointerClick className="w-4 h-4 text-muted-foreground" />
                    </div>
                  ))}
                </div>
                {/* install prompt mock */}
                <div className="mt-auto p-3 rounded-2xl bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowDownToLine className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold">
                      Adicionar à tela inicial
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Acesse o FastProxy com um toque, sem digitar o endereço.
                  </p>
                </div>
              </div>
              {/* reflection sheen */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/3 to-transparent pointer-events-none" />
            </div>
          </motion.div>

          {/* Right: steps */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate={isInView ? "visible" : "hidden"}
            className="order-1 md:order-2"
          >
            {/* tabs */}
            <motion.div
              variants={itemVariants}
              className="flex gap-2 mb-8 p-1 rounded-2xl bg-secondary/60 border border-border w-fit"
            >
              <button
                onClick={() => setActiveTab("android")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "android"
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Chrome className="w-4 h-4" />
                Android
              </button>
              <button
                onClick={() => setActiveTab("ios")}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === "ios"
                    ? "bg-primary text-primary-foreground shadow-glow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Apple className="w-4 h-4" />
                iPhone / iPad
              </button>
            </motion.div>

            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="glass rounded-3xl p-6 md:p-8"
            >
              {activeTab === "android" ? <AndroidSteps /> : <iOSSteps />}
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="mt-6 flex flex-wrap gap-3"
            >
              {[
                { icon: Bell, text: "Notificações push" },
                { icon: Gauge, text: "Badge de expiração" },
                { icon: MousePointerClick, text: "Atalhos rápidos" },
              ].map((b, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-secondary/40 text-xs text-muted-foreground"
                >
                  <b.icon className="w-3.5 h-3.5 text-primary" />
                  {b.text}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function ZapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-primary"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}
