import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { ArrowLeft, CreditCard, Loader2, Minus, Plus, Tag, Mail, User } from "lucide-react";
import { z } from "zod";
import { createCheckoutSession } from "@/lib/checkout.functions";

type Slug = "ipv6-br" | "ipv4-us" | "ipv6-fb-br" | "isp-us";

type CatalogItem = {
  slug: Slug;
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
    name: "Proxy IPv6 Brasil",
    tagline: "Econômico para escala — entregue em blocos de 10 IPs",
    monthly: 3000,
    yearly: 29700,
    blockSize: 10,
    unitLabel: "bloco",
  },
  "ipv6-fb-br": {
    slug: "ipv6-fb-br",
    name: "IPv6 para Facebook Ads",
    tagline: "Inclui 10 rotações de IP / mês por proxy",
    monthly: 8000,
    yearly: 79200,
    blockSize: 10,
    unitLabel: "bloco",
  },
  "ipv4-us": {
    slug: "ipv4-us",
    name: "IPv4 Dedicado EUA",
    tagline: "IP exclusivo, banda ilimitada",
    monthly: 12000,
    yearly: 118800,
    blockSize: 1,
    unitLabel: "proxy",
  },
  "isp-us": {
    slug: "isp-us",
    name: "Proxy ISP Residencial EUA",
    tagline: "IP residencial puro, indetectável",
    monthly: 18000,
    yearly: 178200,
    blockSize: 1,
    unitLabel: "proxy",
  },
};

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

function CheckoutPage() {
  const search = Route.useSearch();
  const startCheckout = useServerFn(createCheckoutSession);

  const [slug, setSlug] = useState<Slug>(search.plan ?? "ipv6-br");
  const [billing, setBilling] = useState<"monthly" | "yearly">(
    search.billing ?? "monthly",
  );
  const [qty, setQty] = useState<number>(search.qty ?? 1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const item = CATALOG[slug];
  const unitCents = billing === "yearly" ? item.yearly : item.monthly;
  const total = unitCents * qty;

  const ipsTotal = useMemo(() => qty * item.blockSize, [qty, item.blockSize]);

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
          <div className="flex items-center gap-3 mb-6">
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

          {/* Plan picker */}
          <div className="mb-6">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Plano
            </label>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.values(CATALOG) as CatalogItem[]).map((p) => {
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
                    <div className="font-bold text-sm">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {p.tagline}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Billing toggle */}
          <div className="mb-6">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Ciclo de cobrança
            </label>
            <div className="mt-2 inline-flex p-1 rounded-xl border border-border bg-background">
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
          </div>

          {/* Quantity */}
          <div className="mb-6">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Quantidade ({item.unitLabel}
              {qty > 1 ? "s" : ""})
            </label>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-lg border border-border hover:border-foreground/30 flex items-center justify-center"
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
                className="w-24 h-10 text-center rounded-lg border border-border bg-background text-lg font-bold"
              />
              <button
                onClick={() => setQty((q) => Math.min(500, q + 1))}
                className="w-10 h-10 rounded-lg border border-border hover:border-foreground/30 flex items-center justify-center"
                aria-label="Aumentar"
              >
                <Plus className="w-4 h-4" />
              </button>
              {item.blockSize > 1 && (
                <span className="text-sm text-muted-foreground">
                  = <strong className="text-foreground">{ipsTotal} IPs</strong>
                </span>
              )}
            </div>
          </div>

          {/* Coupon notice */}
          <div className="mb-6 p-4 rounded-xl border border-border bg-background/60 flex items-start gap-3">
            <Tag className="w-4 h-4 mt-0.5 text-primary" />
            <div className="text-sm text-muted-foreground">
              Tem um <strong className="text-foreground">cupom de desconto</strong>? Você pode
              aplicá-lo no próximo passo (campo "Adicionar código promocional" do Stripe).
              O desconto será mantido automaticamente nas próximas mensalidades quando aplicável.
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-2xl border border-border p-5 bg-background/60">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Plano</span>
              <span className="font-semibold">{item.name}</span>
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
              <span className="font-bold">Total a cada {billing === "yearly" ? "12 meses" : "30 dias"}</span>
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
            Pagamento processado pelo Stripe. Cartão de crédito, Pix e boleto disponíveis
            conforme sua conta. Sem fidelidade — cancele quando quiser.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
