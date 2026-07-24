import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Package, Sparkles } from "lucide-react";
import {
  listPackagesPublic,
  createPackageCheckoutSession,
  type ProductPackageGroup,
} from "@/lib/packages.functions";
import Navbar from "@/components/site/Navbar";
import Footer from "@/components/site/Footer";

export const Route = createFileRoute("/pacotes")({
  head: () => ({
    meta: [
      { title: "Pacotes prépagos IPv6 — economize até 50% | FastProxy" },
      {
        name: "description",
        content:
          "Compre múltiplos IPv6 com desconto por volume e por prazo. Pague uma vez, use por 1, 3, 6 ou 12 meses. Sem renovação automática, sem surpresa.",
      },
      { property: "og:title", content: "Pacotes prépagos IPv6 — FastProxy" },
      {
        property: "og:description",
        content:
          "Desconto por volume e prazo. Prépago em Reais, sem renovação automática.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["public-packages"],
      queryFn: () => listPackagesPublic(),
    }),
  component: PackagesPage,
});

function PackagesPage() {
  const fn = useServerFn(listPackagesPublic);
  const { data } = useQuery({
    queryKey: ["public-packages"],
    queryFn: () => fn(),
  });
  const groups = data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <header className="text-center mb-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold uppercase tracking-wide">
            <Sparkles className="w-3 h-3" /> Pacotes prépagos
          </span>
          <h1 className="text-3xl md:text-5xl font-black mt-4">
            Compre em volume, pague menos, esqueça a renovação
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            Escolha a quantidade e o prazo. Uma cobrança só, sem renovação automática.
            Quanto mais IPs e mais tempo, maior o desconto.
          </p>
        </header>

        {groups.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">
            Nenhum pacote disponível no momento.
          </div>
        )}

        <div className="space-y-12">
          {groups.map((g) => (
            <ProductBlock key={g.product_id} group={g} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function ProductBlock({ group }: { group: ProductPackageGroup }) {
  const quantities = useMemo(
    () => Array.from(new Set(group.packages.map((p) => p.quantity))).sort((a, b) => a - b),
    [group.packages],
  );
  const terms = useMemo(
    () => Array.from(new Set(group.packages.map((p) => p.term_months))).sort((a, b) => a - b),
    [group.packages],
  );
  const [qty, setQty] = useState<number>(quantities[0] ?? 5);
  const [term, setTerm] = useState<number>(terms[terms.length - 1] ?? 12);

  const selected = group.packages.find(
    (p) => p.quantity === qty && p.term_months === term,
  );

  const monthlyRefTotal =
    group.price_monthly_cents * qty * term;
  const discountPct =
    selected && monthlyRefTotal > 0
      ? Math.max(0, Math.round((1 - selected.price_cents / monthlyRefTotal) * 100))
      : 0;

  return (
    <section className="rounded-3xl border border-border bg-card p-6 md:p-8">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wide font-bold text-primary">
            <Package className="w-3 h-3" /> {group.category} · {group.country_code}
          </div>
          <h2 className="text-2xl md:text-3xl font-black mt-1">{group.product_name}</h2>
          {group.product_description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              {group.product_description}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Referência mensal: <br />
          <span className="text-foreground font-bold">
            {formatBRL(group.price_monthly_cents)}/IP·mês
          </span>
        </div>
      </div>

      {/* Quantity selector */}
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Quantidade de IPs
        </p>
        <div className="flex flex-wrap gap-2">
          {quantities.map((q) => (
            <button
              key={q}
              onClick={() => setQty(q)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                q === qty
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:border-primary/50"
              }`}
            >
              {q} IPs
            </button>
          ))}
        </div>
      </div>

      {/* Term selector */}
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
          Prazo
        </p>
        <div className="flex flex-wrap gap-2">
          {terms.map((t) => (
            <button
              key={t}
              onClick={() => setTerm(t)}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-colors ${
                t === term
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:border-primary/50"
              }`}
            >
              {t === 1 ? "1 mês" : `${t} meses`}
            </button>
          ))}
        </div>
      </div>

      {/* Selected card */}
      {selected ? (
        <SelectedPackageCard
          pkg={selected}
          discountPct={discountPct}
          monthlyRef={group.price_monthly_cents}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Combinação sem preço configurado. Escolha outra quantidade ou prazo.
        </div>
      )}
    </section>
  );
}

function SelectedPackageCard({
  pkg,
  discountPct,
  monthlyRef,
}: {
  pkg: ProductPackageGroup["packages"][number];
  discountPct: number;
  monthlyRef: number;
}) {
  const perIpMonth = pkg.price_cents / pkg.quantity / pkg.term_months;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [coupon, setCoupon] = useState("");
  const [showForm, setShowForm] = useState(false);
  const buyFn = useServerFn(createPackageCheckoutSession);

  const buy = useMutation({
    mutationFn: () =>
      buyFn({
        data: {
          packageId: pkg.id,
          email: email.trim(),
          name: name.trim() || email.split("@")[0],
          couponCode: coupon.trim() || null,
        },
      }),
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide font-bold text-primary">
            {pkg.label ?? `${pkg.quantity} IPs · ${pkg.term_months}m`}
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-4xl font-black">{formatBRL(pkg.price_cents)}</span>
            <span className="text-sm text-muted-foreground">à vista</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {formatBRL(perIpMonth)}/IP·mês · {pkg.quantity} IPs por {pkg.term_months}{" "}
            {pkg.term_months === 1 ? "mês" : "meses"}
          </p>
        </div>
        {discountPct > 0 && (
          <div className="text-right">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-500 px-3 py-1 text-xs font-black">
              Economize {discountPct}%
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              vs {formatBRL(monthlyRef)}/IP·mês
            </p>
          </div>
        )}
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mb-5">
        <Feat text="Cobrança única (sem renovação automática)" />
        <Feat text="Ativação imediata após pagamento" />
        <Feat text="Suporte via WhatsApp e chat" />
        <Feat text="Substituição gratuita em caso de bloqueio" />
      </ul>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full md:w-auto px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black hover:opacity-90"
        >
          Contratar {pkg.quantity} IPs por {pkg.term_months}{" "}
          {pkg.term_months === 1 ? "mês" : "meses"}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="email"
              required
              placeholder="Seu e-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              type="text"
              placeholder="Seu nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Cupom (opcional)"
            value={coupon}
            onChange={(e) => setCoupon(e.target.value.toUpperCase())}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={() => buy.mutate()}
              disabled={buy.isPending || !email.includes("@")}
              className="flex-1 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-black hover:opacity-90 disabled:opacity-50"
            >
              {buy.isPending ? "Redirecionando…" : "Ir para pagamento"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-3 rounded-xl border border-border text-sm"
            >
              Voltar
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Pagamento via Stripe. Cartão ou Pix (BRL).
          </p>
        </div>
      )}
    </div>
  );
}

function Feat({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
      <span>{text}</span>
    </li>
  );
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
