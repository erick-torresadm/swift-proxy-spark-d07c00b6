import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Minus, Plus, Tag, Check, ShoppingCart, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
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
    tagline: "Econômico para escala",
    monthly: 3000,
    yearly: 29700,
    blockSize: 1,
    unitLabel: "proxy",
  },
  "ipv6-fb-br": {
    slug: "ipv6-fb-br",
    country: "BR",
    name: "IPv6 para Facebook Ads",
    tagline: "10 rotações de IP / mês por proxy",
    monthly: 8000,
    yearly: 79200,
    blockSize: 1,
    unitLabel: "proxy",
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

const COUNTRIES: { code: Country; label: string; flag: string }[] = [
  { code: "BR", label: "Brasil", flag: "🇧🇷" },
  { code: "US", label: "Estados Unidos", flag: "🇺🇸" },
];

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function BuyMoreDialog({
  children,
  initialSlug,
}: {
  children: React.ReactNode;
  initialSlug?: Slug;
}) {
  const { user } = useAuth();
  const startCheckout = useServerFn(createCheckoutSession);
  const validateCoupon = useServerFn(validateCouponPublic);

  const [open, setOpen] = useState(false);
  const start: Slug = initialSlug ?? "ipv6-br";
  const [country, setCountry] = useState<Country>(CATALOG[start].country);
  const [slug, setSlug] = useState<Slug>(start);
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [qty, setQty] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_cents: number;
  } | null>(null);
  const initialPhone =
    (user?.user_metadata?.whatsapp as string | undefined) ||
    (user?.user_metadata?.phone as string | undefined) ||
    (user?.phone as string | undefined) ||
    "";
  const [whatsapp, setWhatsapp] = useState<string>(initialPhone);

  const plansForCountry = useMemo(
    () => (Object.values(CATALOG) as CatalogItem[]).filter((p) => p.country === country),
    [country],
  );

  const item = CATALOG[slug];
  const unitCents = billing === "yearly" ? item.yearly : item.monthly;
  const subtotal = unitCents * qty;
  const discount = appliedCoupon?.discount_cents ?? 0;
  const total = Math.max(0, subtotal - discount);

  function handleCountry(c: Country) {
    setCountry(c);
    const stillValid = CATALOG[slug].country === c;
    if (!stillValid) {
      const first = (Object.values(CATALOG) as CatalogItem[]).find((p) => p.country === c);
      if (first) setSlug(first.slug);
    }
  }

  async function applyCoupon() {
    setCouponMsg(null);
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    try {
      const res = await validateCoupon({
        data: { code, amount_cents: subtotal, billing },
      });
      if (res.valid && res.discount_cents) {
        setAppliedCoupon({ code: res.code ?? code, discount_cents: res.discount_cents });
        setCouponMsg({ kind: "ok", text: `Cupom aplicado: -${formatBRL(res.discount_cents)}` });
      } else {
        setAppliedCoupon(null);
        setCouponMsg({ kind: "err", text: res.reason ?? "Cupom inválido" });
      }
    } catch (e) {
      setAppliedCoupon(null);
      setCouponMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao validar" });
    } finally {
      setCouponBusy(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    const email = user?.email?.toLowerCase().trim();
    const name =
      (user?.user_metadata?.full_name as string | undefined)?.trim() ||
      email?.split("@")[0] ||
      "Cliente";
    if (!email) {
      setError("Sessão expirada. Faça login novamente.");
      return;
    }
    const cleanPhone = whatsapp.replace(/\D/g, "");
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      setError("Informe seu WhatsApp com DDD");
      return;
    }
    setSubmitting(true);
    try {
      const res = await startCheckout({
        data: {
          productSlug: slug,
          quantity: qty,
          billing,
          email,
          name,
          whatsapp: cleanPhone,
          couponCode: appliedCoupon?.code ?? null,
        },
      });
      if (res?.url) {
        // Abre o checkout do Stripe em nova aba para não tirar o cliente do painel
        window.open(res.url, "_blank", "noopener,noreferrer");
        setSubmitting(false);
      } else {
        throw new Error("Sessão de checkout inválida");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar checkout");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" />
            Comprar mais proxies
          </DialogTitle>
          <DialogDescription>
            Configure abaixo. O pagamento abre em uma nova aba — você não sai do painel.
          </DialogDescription>
        </DialogHeader>

        {/* País */}
        <section className="mt-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            País
          </p>
          <div className="grid grid-cols-2 gap-2">
            {COUNTRIES.map((c) => {
              const active = c.code === country;
              return (
                <button
                  key={c.code}
                  onClick={() => handleCountry(c.code)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition flex items-center gap-2 ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-foreground/30"
                  }`}
                >
                  <span className="text-xl leading-none">{c.flag}</span>
                  <span className="font-bold text-sm flex-1">{c.label}</span>
                  {active && <Check className="w-4 h-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Plano */}
        <section>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Tipo de proxy
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plansForCountry.map((p) => {
              const active = p.slug === slug;
              return (
                <button
                  key={p.slug}
                  onClick={() => setSlug(p.slug)}
                  className={`text-left rounded-xl border px-3 py-2.5 transition ${
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
                  <div className="text-xs font-semibold text-foreground/80 mt-1.5">
                    {formatBRL(p.monthly)}/{p.unitLabel}/mês
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Ciclo */}
        <section>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Ciclo
          </p>
          <div className="inline-flex p-1 rounded-xl border border-border bg-background">
            {(["monthly", "yearly"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBilling(b)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
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

        {/* Quantidade */}
        <section>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Quantidade
          </p>
          <div className="flex items-center gap-2">
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
              className="w-20 h-10 text-center rounded-lg border border-border bg-background text-base font-bold"
            />
            <button
              onClick={() => setQty((q) => Math.min(500, q + 1))}
              className="w-10 h-10 rounded-lg border border-border hover:border-foreground/30 flex items-center justify-center"
              aria-label="Aumentar"
            >
              <Plus className="w-4 h-4" />
            </button>
            <span className="text-sm text-muted-foreground ml-1">
              = <strong className="text-foreground">{qty} proxies</strong>
            </span>
          </div>
        </section>

        {/* Cupom */}
        <section className="rounded-xl border border-border bg-background/60 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">Cupom de desconto</span>
          </div>
          {appliedCoupon ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5">
              <div className="text-sm">
                <span className="font-bold text-primary">{appliedCoupon.code}</span>
                <span className="text-muted-foreground">
                  {" "}— -{formatBRL(appliedCoupon.discount_cents)}
                </span>
              </div>
              <button
                onClick={() => {
                  setAppliedCoupon(null);
                  setCouponCode("");
                  setCouponMsg(null);
                }}
                className="text-xs font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider"
              >
                Remover
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyCoupon();
                  }
                }}
                placeholder="Digite o código"
                maxLength={40}
                className="flex-1 h-9 px-3 rounded-lg border border-border bg-background text-sm font-mono uppercase tracking-wider focus:border-primary focus:outline-none"
              />
              <button
                onClick={applyCoupon}
                disabled={couponBusy || !couponCode.trim()}
                className="h-9 px-4 rounded-lg bg-foreground text-background font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 transition"
              >
                {couponBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Aplicar"}
              </button>
            </div>
          )}
          {couponMsg && (
            <p
              className={`text-xs mt-2 ${
                couponMsg.kind === "ok" ? "text-emerald-400" : "text-destructive"
              }`}
            >
              {couponMsg.text}
            </p>
          )}
        </section>

        {/* Resumo */}
        <div className="rounded-xl border border-border p-4 bg-background/60">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">{qty} × {formatBRL(unitCents)}</span>
            <span className="font-semibold">{formatBRL(subtotal)}</span>
          </div>
          {appliedCoupon && (
            <div className="flex justify-between text-sm mb-1.5 text-emerald-400">
              <span>Cupom {appliedCoupon.code}</span>
              <span className="font-bold">-{formatBRL(discount)}</span>
            </div>
          )}
          <div className="border-t border-border my-2" />
          <div className="flex justify-between items-baseline">
            <span className="font-bold text-sm">
              Total / {billing === "yearly" ? "ano" : "mês"}
            </span>
            <span className="text-2xl font-black text-primary">{formatBRL(total)}</span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-3.5 rounded-xl bg-gradient-primary text-primary-foreground font-bold text-base shadow-glow hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Abrindo pagamento…
            </>
          ) : (
            <>
              Ir para o pagamento seguro <ExternalLink className="w-4 h-4" />
            </>
          )}
        </button>

        <p className="text-center text-xs text-muted-foreground">
          Pagamento processado pelo Stripe. Cartão, Pix e boleto. Sem fidelidade.
        </p>
      </DialogContent>
    </Dialog>
  );
}
