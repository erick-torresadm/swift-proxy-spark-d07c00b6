import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
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
  Clock,
  Zap,
  Sparkles,
  Shield,
  Users,
  CalendarClock,
} from "lucide-react";
import { z } from "zod";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { validateCouponPublic } from "@/lib/coupons.functions";
import { getPublicCatalog } from "@/lib/catalog.functions";
import { pixelTrack } from "@/lib/meta-pixel";
import { computeBumpsTotals, BUMP_CONFIG, type Bumps } from "@/lib/order-bumps";


type Slug =
  | "ipv6-br" | "ipv6-us"
  | "ipv6-fb-br" | "ipv6-fb-us"
  | "ipv4-br" | "ipv4-us"
  | "isp-br" | "isp-us";
type Country = "BR" | "US";
type Kind = "ipv6" | "ipv6_fb" | "ipv4" | "isp";

type CatalogMeta = {
  slug: Slug;
  country: Country;
  kind: Kind;
  name: string;
  tagline: string;
  blockSize: number;
  unitLabel: string;
};

type CatalogItem = CatalogMeta & { monthly: number; yearly: number };

// Static metadata. Prices come from the DB (getPublicCatalog) with fallbacks.
const META: Record<Slug, CatalogMeta> = {
  "ipv6-br": {
    slug: "ipv6-br", country: "BR", kind: "ipv6",
    name: "Proxy IPv6 Brasil",
    tagline: "Econômico para escala — 1 IP por proxy",
    blockSize: 1, unitLabel: "proxy",
  },
  "ipv6-fb-br": {
    slug: "ipv6-fb-br", country: "BR", kind: "ipv6_fb",
    name: "IPv6 Facebook Ads — Brasil",
    tagline: "Inclui rotações de IP / mês por proxy",
    blockSize: 1, unitLabel: "proxy",
  },
  "ipv6-us": {
    slug: "ipv6-us", country: "US", kind: "ipv6",
    name: "Proxy IPv6 EUA",
    tagline: "IPs americanos — escala internacional",
    blockSize: 1, unitLabel: "proxy",
  },
  "ipv6-fb-us": {
    slug: "ipv6-fb-us", country: "US", kind: "ipv6_fb",
    name: "IPv6 Facebook Ads — EUA",
    tagline: "Inclui rotações de IP / mês por proxy",
    blockSize: 1, unitLabel: "proxy",
  },
  "ipv4-br": {
    slug: "ipv4-br", country: "BR", kind: "ipv4",
    name: "IPv4 Dedicado Brasil",
    tagline: "IP exclusivo brasileiro (entrega em até 10 min)",
    blockSize: 1, unitLabel: "proxy",
  },
  "ipv4-us": {
    slug: "ipv4-us", country: "US", kind: "ipv4",
    name: "IPv4 Dedicado EUA",
    tagline: "IP exclusivo, banda ilimitada (entrega em até 10 min)",
    blockSize: 1, unitLabel: "proxy",
  },
  "isp-br": {
    slug: "isp-br", country: "BR", kind: "isp",
    name: "Proxy ISP Residencial Brasil",
    tagline: "IP residencial brasileiro (entrega em até 10 min)",
    blockSize: 1, unitLabel: "proxy",
  },
  "isp-us": {
    slug: "isp-us", country: "US", kind: "isp",
    name: "Proxy ISP Residencial EUA",
    tagline: "IP residencial puro, indetectável (entrega em até 10 min)",
    blockSize: 1, unitLabel: "proxy",
  },
};

const FALLBACK_PRICES: Record<Slug, { monthly: number; yearly: number }> = {
  "ipv6-br":    { monthly: 3000, yearly: 29700 },
  "ipv6-fb-br": { monthly: 8000, yearly: 79200 },
  "ipv6-us":    { monthly: 3000, yearly: 29700 },
  "ipv6-fb-us": { monthly: 8000, yearly: 79200 },
  "ipv4-br":    { monthly: 4990, yearly: 49401 },
  "ipv4-us":    { monthly: 4990, yearly: 49401 },
  "isp-br":     { monthly: 9900, yearly: 98010 },
  "isp-us":     { monthly: 9900, yearly: 98010 },
};

const COUNTRIES: { code: Country; label: string; flag: string; desc: string }[] = [
  { code: "BR", label: "Brasil", flag: "🇧🇷", desc: "IPs brasileiros — ideal para o mercado nacional" },
  { code: "US", label: "Estados Unidos", flag: "🇺🇸", desc: "IPs americanos — global e plataformas internacionais" },
];

const searchSchema = z.object({
  plan: z.enum(["ipv6-br", "ipv4-us", "ipv6-fb-br", "ipv6-fb-us", "isp-us", "ipv6-us"]).optional(),
  billing: z.enum(["monthly", "yearly"]).optional(),
  qty: z.coerce.number().int().min(1).max(500).optional(),
  canceled: z.coerce.boolean().optional(),
  coupon: z.string().trim().min(1).max(40).optional(),
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

function BumpRow({
  Icon,
  checked,
  onToggle,
  title,
  desc,
  priceLabel,
}: {
  Icon: typeof Plus;
  checked: boolean;
  onToggle: () => void;
  title: string;
  desc: string;
  priceLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left rounded-xl border px-4 py-3 transition flex items-start gap-3 ${
        checked ? "border-primary bg-primary/10" : "border-border hover:border-foreground/30 bg-background/40"
      }`}
    >
      <div className="mt-0.5 shrink-0">
        <div
          className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
            checked ? "bg-primary border-primary" : "border-muted-foreground/40"
          }`}
        >
          {checked && <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Icon className="w-4 h-4 text-primary shrink-0" />
          <span className="font-bold text-sm">{title}</span>
          <span className="ml-auto text-xs font-bold text-primary">{priceLabel}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">{desc}</div>
      </div>
    </button>
  );
}


function CheckoutPage() {
  const location = useLocation();
  const search = Route.useSearch();
  const startCheckout = useServerFn(createCheckoutSession);
  const validateCoupon = useServerFn(validateCouponPublic);
  const fetchCatalog = useServerFn(getPublicCatalog);

  const { data: liveCatalog } = useQuery({
    queryKey: ["public-catalog"],
    queryFn: () => fetchCatalog(),
    staleTime: 60_000,
  });

  const initialSlug: Slug = search.plan ?? "ipv6-br";
  const [country, setCountry] = useState<Country>(META[initialSlug].country);
  const [slug, setSlug] = useState<Slug>(initialSlug);
  const [billing, setBilling] = useState<"monthly" | "yearly">(
    search.billing ?? "monthly",
  );
  const [qty, setQty] = useState<number>(search.qty ?? 1);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_cents: number } | null>(null);
  const [bumps, setBumps] = useState<Bumps>({});

  // Scarcity timer: 15 min lock on the annual discount for anyone viewing monthly.
  const [scarcityLeft, setScarcityLeft] = useState<number>(15 * 60);
  useEffect(() => {
    const KEY = "fp_annual_scarcity_deadline";
    let deadline = Number(sessionStorage.getItem(KEY) || 0);
    if (!deadline || deadline < Date.now()) {
      deadline = Date.now() + 15 * 60 * 1000;
      sessionStorage.setItem(KEY, String(deadline));
    }
    const tick = () => setScarcityLeft(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);


  // Merge live DB prices with static metadata.
  const CATALOG = useMemo(() => {
    const byslug = new Map(
      (liveCatalog ?? []).map((p) => [
        p.slug,
        {
          monthly: p.price_monthly_cents,
          yearly: p.price_yearly_cents ?? Math.round(p.price_monthly_cents * 12 * 0.825),
        },
      ]),
    );
    const out = {} as Record<Slug, CatalogItem>;
    (Object.keys(META) as Slug[]).forEach((s) => {
      const live = byslug.get(s);
      out[s] = {
        ...META[s],
        monthly: live?.monthly ?? FALLBACK_PRICES[s].monthly,
        yearly: live?.yearly ?? FALLBACK_PRICES[s].yearly,
      };
    });
    return out;
  }, [liveCatalog]);

  const plansForCountry = useMemo(
    () => (Object.values(CATALOG) as CatalogItem[]).filter((p) => p.country === country),
    [country, CATALOG],
  );

  if (location.pathname !== "/checkout") {
    return <Outlet />;
  }

  const item = CATALOG[slug];
  const unitCents = billing === "yearly" ? item.yearly : item.monthly;
  const subtotal = unitCents * qty;

  // Server = source of truth. We recompute the same numbers on the client for preview.
  const bumpTotals = computeBumpsTotals({
    billing,
    unitMonthlyCents: item.monthly,
    quantity: qty,
    bumps,
  });
  const bumpsSubtotal =
    bumpTotals.extraProxiesRecurringCents * (billing === "yearly" ? 12 : 1) +
    bumpTotals.firstInvoiceExtraCents;
  const discount = appliedCoupon?.discount_cents ?? 0;
  const total = Math.max(0, subtotal + bumpsSubtotal - discount);
  const ipsTotal = (qty + bumpTotals.extraProxies) * item.blockSize;


  // Fire ViewContent when the user lands on /checkout with a chosen plan
  useEffect(() => {
    pixelTrack("ViewContent", {
      content_ids: [slug],
      content_name: item.name,
      content_type: "product",
      value: unitCents / 100,
      currency: "BRL",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, billing]);




  // Re-validate coupon whenever the total changes
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

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponMsg(null);
  }

  // Auto-apply coupon from URL (?coupon=VOLTA20) on first valid subtotal
  const autoCouponTried = useRef(false);
  useEffect(() => {
    if (autoCouponTried.current) return;
    const fromUrl = search.coupon?.trim().toUpperCase();
    if (!fromUrl || subtotal <= 0) return;
    autoCouponTried.current = true;
    setCouponCode(fromUrl);
    (async () => {
      setCouponBusy(true);
      try {
        const res = await validateCoupon({
          data: { code: fromUrl, amount_cents: subtotal, billing },
        });
        if (res.valid && res.discount_cents) {
          setAppliedCoupon({ code: res.code ?? fromUrl, discount_cents: res.discount_cents });
          setCouponMsg({ kind: "ok", text: `Cupom aplicado: -${formatBRL(res.discount_cents)}` });
        } else {
          setCouponMsg({ kind: "err", text: res.reason ?? "Cupom inválido" });
        }
      } catch {
        /* ignore */
      } finally {
        setCouponBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  function handleCountry(c: Country) {
    setCountry(c);
    if (META[slug].country === c) return;
    // Preserve the same proxy kind across countries when available
    const currentKind = META[slug].kind;
    const sameKind = (Object.values(META) as CatalogMeta[]).find(
      (p) => p.country === c && p.kind === currentKind,
    );
    if (sameKind) {
      setSlug(sameKind.slug);
      return;
    }
    const first = (Object.values(META) as CatalogMeta[]).find((p) => p.country === c);
    if (first) setSlug(first.slug);
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
      pixelTrack("InitiateCheckout", {
        content_ids: [slug],
        content_name: item.name,
        content_type: "product",
        contents: [{ id: slug, quantity: qty, item_price: unitCents / 100 }],
        num_items: qty,
        value: total / 100,
        currency: "BRL",
      });
      const res = await startCheckout({
        data: {
          productSlug: slug,
          quantity: qty,
          billing,
          email: cleanEmail,
          name: cleanName,
          couponCode: appliedCoupon?.code ?? null,
          bumps: {
            extraProxies: bumps.extraProxies ?? 0,
            extendMonths: bumps.extendMonths ?? 0,
            vipSupport: !!bumps.vipSupport,
            setupAssist: !!bumps.setupAssist,
          },
        },
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

          {/* Step 3 — Billing (reforço agressivo pró-anual) */}
          <section className="mb-8">
            <StepHeader n={3} title="Ciclo de cobrança" hint="Escolha o plano que mais cabe no seu bolso" />

            {/* Scarcity timer aparece quando mensal selecionado */}
            <AnimatePresence>
              {billing === "monthly" && scarcityLeft > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 text-amber-200 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    <span>
                      <strong>Trave o desconto anual</strong> — oferta expira em{" "}
                      <span className="font-mono font-bold tabular-nums">
                        {String(Math.floor(scarcityLeft / 60)).padStart(2, "0")}:
                        {String(scarcityLeft % 60).padStart(2, "0")}
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() => setBilling("yearly")}
                    className="text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:text-white underline underline-offset-2"
                  >
                    Trocar pra anual
                  </button>
                </motion.div>
              )}
              {billing === "yearly" && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 text-emerald-300 px-3 py-2 text-xs"
                >
                  <Check className="w-4 h-4" />
                  <span><strong>Desconto anual travado</strong> — 2 meses grátis + bônus exclusivos abaixo</span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Anual — card em destaque */}
              <button
                onClick={() => setBilling("yearly")}
                className={`relative text-left rounded-xl border px-4 py-4 transition ${
                  billing === "yearly"
                    ? "border-primary bg-primary/10 shadow-[0_0_30px_-8px_hsl(var(--primary)/0.5)]"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <span className="absolute -top-2 left-3 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary text-primary-foreground">
                  Mais escolhido — 2 meses grátis
                </span>
                <div className="flex items-start justify-between gap-2 mt-1">
                  <div>
                    <div className="font-bold text-sm">Anual</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Pague 10, use 12 meses • economia de 17,5%
                    </div>
                  </div>
                  {billing === "yearly" && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
                <ul className="mt-3 space-y-1.5 text-[12px] text-foreground/85">
                  <li className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" /> +10% de IPs bônus</li>
                  <li className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5 text-primary" /> Trava de preço 12 meses</li>
                  <li className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-primary" /> Suporte prioritário incluso</li>
                  <li className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Garantia estendida 60 dias</li>
                </ul>
              </button>

              {/* Mensal — neutro */}
              <button
                onClick={() => setBilling("monthly")}
                className={`text-left rounded-xl border px-4 py-4 transition ${
                  billing === "monthly"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-foreground/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm">Mensal</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Flexível, cancele quando quiser
                    </div>
                  </div>
                  {billing === "monthly" && <Check className="w-4 h-4 text-primary shrink-0" />}
                </div>
                <ul className="mt-3 space-y-1.5 text-[12px] text-muted-foreground">
                  <li>• Sem bônus</li>
                  <li>• Preço sujeito a reajuste</li>
                  <li>• Sem suporte prioritário</li>
                </ul>
              </button>
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

          {/* Step 6 — Order bumps (upgrades opcionais) */}
          <section className="mb-8">
            <StepHeader
              n={6}
              title="Turbine seu pedido"
              hint="Adicionais opcionais com desconto — só neste checkout"
            />
            <div className="space-y-2.5">
              {/* +N proxies extras */}
              <BumpRow
                Icon={Plus}
                checked={(bumps.extraProxies ?? 0) > 0}
                onToggle={() =>
                  setBumps((b) => ({
                    ...b,
                    extraProxies: (b.extraProxies ?? 0) > 0 ? 0 : BUMP_CONFIG.extraProxies.defaultCount,
                  }))
                }
                title={`+${BUMP_CONFIG.extraProxies.defaultCount} proxies extras — 20% off no adicional`}
                desc="Mesmo produto, entregues junto. Recorrente."
                priceLabel={`+${formatBRL(
                  Math.round(
                    BUMP_CONFIG.extraProxies.defaultCount *
                      item.monthly *
                      (billing === "yearly" ? 12 : 1) *
                      (1 - BUMP_CONFIG.extraProxies.discount),
                  ),
                )}/${billing === "yearly" ? "ano" : "mês"}`}
              />

              {/* Estender +6 meses (só mensal) */}
              {billing === "monthly" && (
                <BumpRow
                  Icon={CalendarClock}
                  checked={(bumps.extendMonths ?? 0) > 0}
                  onToggle={() =>
                    setBumps((b) => ({
                      ...b,
                      extendMonths:
                        (b.extendMonths ?? 0) > 0 ? 0 : BUMP_CONFIG.extendMonths.months,
                    }))
                  }
                  title={`Pré-pague +${BUMP_CONFIG.extendMonths.months} meses — 30% off`}
                  desc="Cobrado uma vez agora. Trava o preço e evita esquecer."
                  priceLabel={`+${formatBRL(bumpTotals.extendMonthsCents || Math.round(BUMP_CONFIG.extendMonths.months * item.monthly * qty * 0.7))} (única vez)`}
                />
              )}

              {/* Suporte VIP */}
              <BumpRow
                Icon={Users}
                checked={!!bumps.vipSupport}
                onToggle={() => setBumps((b) => ({ ...b, vipSupport: !b.vipSupport }))}
                title="Suporte Prioritário VIP"
                desc="Atendimento por WhatsApp, resposta < 15min, engenheiro dedicado."
                priceLabel={`+${formatBRL(BUMP_CONFIG.vipSupport.firstInvoiceCents)}`}
              />

              {/* Setup assistido */}
              <BumpRow
                Icon={Sparkles}
                checked={!!bumps.setupAssist}
                onToggle={() => setBumps((b) => ({ ...b, setupAssist: !b.setupAssist }))}
                title="Setup assistido 1:1"
                desc="Vídeo-chamada de 30min pra configurar Chrome/anti-detect com você."
                priceLabel={`+${formatBRL(BUMP_CONFIG.setupAssist.oneTimeCents)} (única vez)`}
              />
            </div>
          </section>

          {/* Coupon */}
          <div className="mb-6 p-4 rounded-xl border border-border bg-background/60">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold">Cupom de desconto</span>
            </div>
            {appliedCoupon ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                <div className="text-sm">
                  <span className="font-bold text-primary">{appliedCoupon.code}</span>
                  <span className="text-muted-foreground">
                    {" "}— desconto de {formatBRL(appliedCoupon.discount_cents)}
                  </span>
                </div>
                <button
                  onClick={removeCoupon}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
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
                  className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm font-mono uppercase tracking-wider focus:border-primary focus:outline-none"
                />
                <button
                  onClick={applyCoupon}
                  disabled={couponBusy || !couponCode.trim()}
                  className="h-10 px-4 rounded-lg bg-foreground text-background font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50 transition"
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
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-semibold">{formatBRL(subtotal)}</span>
            </div>

            {/* Bumps rows */}
            {bumpTotals.extraProxies > 0 && (
              <div className="flex justify-between text-sm mb-2 text-primary">
                <span>+{bumpTotals.extraProxies} proxies extras ({billing === "yearly" ? "anual" : "mensal"})</span>
                <span className="font-bold">
                  +{formatBRL(bumpTotals.extraProxiesRecurringCents * (billing === "yearly" ? 12 : 1))}
                </span>
              </div>
            )}
            {bumpTotals.extendMonthsCents > 0 && (
              <div className="flex justify-between text-sm mb-2 text-primary">
                <span>Pré-pagamento +{bumpTotals.extendMonths}m (30% off)</span>
                <span className="font-bold">+{formatBRL(bumpTotals.extendMonthsCents)}</span>
              </div>
            )}
            {bumpTotals.vipSupportCents > 0 && (
              <div className="flex justify-between text-sm mb-2 text-primary">
                <span>Suporte Prioritário VIP</span>
                <span className="font-bold">+{formatBRL(bumpTotals.vipSupportCents)}</span>
              </div>
            )}
            {bumpTotals.setupAssistCents > 0 && (
              <div className="flex justify-between text-sm mb-2 text-primary">
                <span>Setup assistido 1:1</span>
                <span className="font-bold">+{formatBRL(bumpTotals.setupAssistCents)}</span>
              </div>
            )}

            {appliedCoupon && (
              <div className="flex justify-between text-sm mb-2 text-emerald-400">
                <span>Cupom {appliedCoupon.code}</span>
                <span className="font-bold">-{formatBRL(appliedCoupon.discount_cents)}</span>
              </div>
            )}
            <div className="border-t border-border my-3" />
            <div className="flex justify-between items-baseline">
              <span className="font-bold">
                Total {billing === "yearly" ? "hoje (12 meses)" : "hoje"}
              </span>
              <span className="text-2xl font-black text-primary">
                {formatBRL(total)}
              </span>
            </div>
            {billing === "monthly" && (
              <div className="mt-2 text-[11px] text-muted-foreground text-right">
                Depois: {formatBRL(unitCents * (qty + bumpTotals.extraProxies))}/mês
              </div>
            )}
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
