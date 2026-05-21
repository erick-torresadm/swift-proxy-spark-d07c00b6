import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Tag,
  Mail,
  User,
  Check,
} from "lucide-react";
import { z } from "zod";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { validateCouponPublic } from "@/lib/coupons.functions";

type Slug = "ipv6-br" | "ipv4-us" | "ipv6-fb-br" | "isp-us";
type Country = "BR" | "US";

type CatalogItem = {
  slug: Slug;
  country: Country;
  name: string;
  tagline: string;
  monthly: number;
  yearly: number;
  blockSize: number;
  unitLabel: string;
};

const CATALOG: Record<Slug, CatalogItem> = {
  "ipv6-br": {
    slug: "ipv6-br",
    country: "BR",
    name: "Proxy IPv6 Brasil",
    tagline: "Econômico para escala — entregue em blocos de 10 IPs",
    monthly: 3000,
    yearly: 29700,
    blockSize: 10,
    unitLabel: "bloco",
  },
  "ipv6-fb-br": {
    slug: "ipv6-fb-br",
    country: "BR",
    name: "IPv6 para Facebook Ads",
    tagline: "Inclui 10 rotações de IP / mês por proxy",
    monthly: 8000,
    yearly: 79200,
    blockSize: 10,
    unitLabel: "bloco",
  },
  "ipv4-us": {
    slug: "ipv4-us",
    country: "US",
    name: "IPv4 Dedicado EUA",
    tagline: "IP exclusivo, banda ilimitada",
    monthly: 12000,
    yearly: 118800,
    blockSize: 1,
    unitLabel: "proxy",
  },
  "isp-us": {
    slug: "isp-us",
    country: "US",
    name: "Proxy ISP Residencial EUA",
    tagline: "IP residencial puro, indetectável",
    monthly: 18000,
    yearly: 178200,
    blockSize: 1,
    unitLabel: "proxy",
  },
};

const COUNTRIES: { code: Country; label: string; flag: string; desc: string }[] = [
  { code: "BR", label: "Brasil", flag: "🇧🇷", desc: "IPs brasileiros — ideal para o mercado nacional" },
  { code: "US", label: "Estados Unidos", flag: "🇺🇸", desc: "IPs americanos — global e plataformas internacionais" },
];

const searchSchema = z.object({
  plan: z.enum(["ipv6-br", "ipv4-us", "ipv6-fb-br", "isp-us"]).optional(),
  billing: z.enum(["monthly", "yearly"]).optional(),
  qty: z.coerce.number().int().min(1).max(500).optional(),
  canceled: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/checkout")({
  validateSearch: searchSchema,
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "Checkout — FastProxy" }] }),
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-black flex items-center justify-center shrink-0">
        {n}
      </span>
      <div>
        <h2 className="text-base font-bold leading-tight">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

function CheckoutPage() {
  const location = useLocation();
  const search = Route.useSearch();
  const startCheckout = useServerFn(createCheckoutSession);
  const validateCoupon = useServerFn(validateCouponPublic);

  if (location.pathname !== "/checkout") {
    return <Outlet />;
  }

  const initialSlug: Slug = search.plan ?? "ipv6-br";
  const [country, setCountry] = useState<Country>(CATALOG[initialSlug].country);
  const [slug, setSlug] = useState<Slug>(initialSlug);
  const [billing, setBilling] = useState<"monthly" | "yearly">(
    search.billing ?? "monthly",
  );
  const [qty, setQty] = useState<number>(search.qty ?? 1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const plansForCountry = useMemo(
    () => (Object.values(CATALOG) as CatalogItem[]).filter((p) => p.country === country),
    [country],
  );

  const item = CATALOG[slug];
  const unitCents = billing === "yearly" ? item.yearly : item.monthly;
  const total = unitCents * qty;
  const ipsTotal = qty * item.blockSize;

  function handleCountry(c: Country) {
    setCountry(c);
    // pick first plan of that country if current plan doesn't match
    const stillValid = CATALOG[slug].country === c;
    if (!stillValid) {
      const first = (Object.values(CATALOG) as CatalogItem[]).find((p) => p.country === c);
      if (first) setSlug(first.slug);
    }
  }

  async function handleSubmit() {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    if (!cleanName || cleanName.length < 2) {
      setError("Informe seu nome completo");
      return;
    }
    if (!emailRegex.test(cleanEmail)) {
      setError("Informe um email válido");
      return;
    }
    setSubmitting(true);
    try {
      const res = await startCheckout({
        data: { productSlug: slug, quantity: qty, billing, email: cleanEmail, name: cleanName },
      });
      if (res?.url) {
        window.location.href = res.url;
      } else {
        throw new Error("Sessão de checkout inválida");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar checkout");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-5 sm:px-6 py-10 sm:py-14">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-card border border-border rounded-3xl p-6 sm:p-10 shadow-card"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
              <CreditCard className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <div className="text-primary text-[11px] font-bold uppercase tracking-[0.2em]">
                Checkout seguro
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-display">
                Finalize sua assinatura
              </h1>
            </div>
          </div>

          {search.canceled && (
            <div className="mb-6 p-4 rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200 text-sm">
              Pagamento cancelado. Você pode tentar novamente quando quiser.
            </div>
          )}

          {/* Step 1 — Country */}
          <section className="mb-8">
            <StepHeader n={1} title="Onde você precisa dos IPs?" hint="País de origem dos proxies" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {COUNTRIES.map((c) => {
                const active = c.code === country;
                return (
                  <button
                    key={c.code}
                    onClick={() => handleCountry(c.code)}
                    className={`text-left rounded-xl border px-4 py-3 transition flex items-start gap-3 ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <span className="text-2xl leading-none">{c.flag}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm flex items-center gap-2">
                        {c.label}
                        {c.code === "BR" && (
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                            Recomendado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{c.desc}</div>
                    </div>
                    {active && <Check className="w-4 h-4 text-primary shrink-0 mt-1" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2 — Plan */}
          <section className="mb-8">
            <StepHeader n={2} title="Escolha o tipo de proxy" hint="Cada opção é otimizada para um uso diferente" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {plansForCountry.map((p) => {
                const active = p.slug === slug;
                return (
                  <button
                    key={p.slug}
                    onClick={() => setSlug(p.slug)}
                    className={`text-left rounded-xl border px-4 py-3 transition ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-foreground/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-sm">{p.name}</div>
                      {active && <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.tagline}</div>
                    <div className="text-xs text-foreground/80 mt-2 font-semibold">
                      a partir de {formatBRL(p.monthly)}/{p.unitLabel}/mês
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 3 — Billing */}
          <section className="mb-8">
            <StepHeader n={3} title="Ciclo de cobrança" hint="Anual economiza 17,5% — pago de uma vez" />
            <div className="inline-flex p-1 rounded-xl border border-border bg-background">
              {(["monthly", "yearly"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBilling(b)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    billing === b
                      ? "bg-primary text-primary-foreground shadow-glow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {b === "monthly" ? "Mensal" : "Anual (-17,5%)"}
                </button>
              ))}
            </div>
          </section>

          {/* Step 4 — Quantity */}
          <section className="mb-8">
            <StepHeader
              n={4}
              title={`Quantos ${item.unitLabel}s você quer?`}
              hint={
                item.blockSize > 1
                  ? `Cada ${item.unitLabel} contém ${item.blockSize} IPs`
                  : "Cada unidade é 1 IP dedicado"
              }
            />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-11 h-11 rounded-lg border border-border hover:border-foreground/30 flex items-center justify-center"
                aria-label="Diminuir"
              >
                <Minus className="w-4 h-4" />
              </button>
              <input
                type="number"
                min={1}
                max={500}
                value={qty}
                onChange={(e) =>
                  setQty(Math.max(1, Math.min(500, Number(e.target.value) || 1)))
                }
                className="w-24 h-11 text-center rounded-lg border border-border bg-background text-lg font-bold"
              />
              <button
                onClick={() => setQty((q) => Math.min(500, q + 1))}
                className="w-11 h-11 rounded-lg border border-border hover:border-foreground/30 flex items-center justify-center"
                aria-label="Aumentar"
              >
                <Plus className="w-4 h-4" />
              </button>
              {item.blockSize > 1 && (
                <span className="text-sm text-muted-foreground">
                  = <strong className="text-foreground">{ipsTotal} IPs no total</strong>
                </span>
              )}
            </div>
          </section>

          {/* Step 5 — Customer data */}
          <section className="mb-8">
            <StepHeader
              n={5}
              title="Seus dados"
              hint="Sua conta é criada automaticamente após o pagamento — enviamos o link de acesso por email"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Nome completo
                </label>
                <div className="mt-1.5 relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: João da Silva"
                    maxLength={120}
                    className="w-full h-11 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:border-primary focus:outline-none transition"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Email de acesso
                </label>
                <div className="mt-1.5 relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    maxLength={255}
                    autoComplete="email"
                    className="w-full h-11 pl-9 pr-3 rounded-lg border border-border bg-background text-sm focus:border-primary focus:outline-none transition"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Coupon notice */}
          <div className="mb-6 p-4 rounded-xl border border-border bg-background/60 flex items-start gap-3">
            <Tag className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="text-sm text-muted-foreground">
              Tem um <strong className="text-foreground">cupom de desconto</strong>? Você
              aplica no próximo passo, no campo "Adicionar código promocional" do Stripe.
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-2xl border border-border p-5 bg-background/60">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
              Resumo do pedido
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">País</span>
              <span className="font-semibold">
                {country === "BR" ? "🇧🇷 Brasil" : "🇺🇸 Estados Unidos"}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-semibold text-right">{item.name}</span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Quantidade</span>
              <span className="font-semibold">
                {qty} × {formatBRL(unitCents)}
              </span>
            </div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Ciclo</span>
              <span className="font-semibold">
                {billing === "yearly" ? "Anual" : "Mensal"}
              </span>
            </div>
            <div className="border-t border-border my-3" />
            <div className="flex justify-between items-baseline">
              <span className="font-bold">
                Total a cada {billing === "yearly" ? "12 meses" : "30 dias"}
              </span>
              <span className="text-2xl font-black text-primary">
                {formatBRL(total)}
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="mt-6 w-full py-4 rounded-xl bg-gradient-primary text-primary-foreground font-bold text-base shadow-glow hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirecionando para o Stripe…
              </>
            ) : (
              <>Ir para o pagamento seguro</>
            )}
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Pagamento processado pelo Stripe. Cartão, Pix e boleto conforme sua conta. Sem
            fidelidade — cancele quando quiser.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
