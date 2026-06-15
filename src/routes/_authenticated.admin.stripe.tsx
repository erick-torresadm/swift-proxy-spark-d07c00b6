import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Activity, DollarSign, TrendingUp, Users, AlertTriangle, RefreshCw, CreditCard,
  CheckCircle2, XCircle, Repeat, AlertCircle, ShieldAlert, Clock, ExternalLink,
  Ban, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  getStripeKpis,
  listStripeEvents,
  syncStripeBackfill,
  listActiveStripeSubscriptions,
  adminCancelSubscriptionAtPeriodEnd,
  adminResumeSubscription,
} from "@/lib/admin-stripe.functions";
import { supabase } from "@/lib/supabase-custom/client";


export const Route = createFileRoute("/_authenticated/admin/stripe")({
  component: AdminStripePage,
  head: () => ({ meta: [{ title: "Stripe — Admin FastProxy" }] }),
});

type Period = "today" | "7d" | "30d";

const fmtBRL = (cents: number, ccy = "BRL") =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: ccy });

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const EVENT_META: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  "checkout.session.completed": { icon: CheckCircle2, color: "text-emerald-500", label: "Venda nova" },
  "checkout.session.async_payment_succeeded": { icon: CheckCircle2, color: "text-emerald-500", label: "Venda confirmada" },
  "checkout.session.expired": { icon: XCircle, color: "text-muted-foreground", label: "Checkout expirado" },
  "invoice.paid": { icon: Repeat, color: "text-emerald-500", label: "Fatura paga" },
  "invoice.payment_succeeded": { icon: Repeat, color: "text-emerald-500", label: "Renovação paga" },
  "invoice.payment_failed": { icon: AlertCircle, color: "text-amber-500", label: "Pagamento falhou" },
  "customer.subscription.deleted": { icon: XCircle, color: "text-destructive", label: "Assinatura cancelada" },
  "customer.subscription.updated": { icon: Repeat, color: "text-blue-500", label: "Assinatura alterada" },
  "customer.subscription.trial_will_end": { icon: Clock, color: "text-amber-500", label: "Trial acabando" },
  "charge.refunded": { icon: RefreshCw, color: "text-amber-500", label: "Reembolso" },
  "charge.dispute.created": { icon: ShieldAlert, color: "text-destructive", label: "Disputa aberta" },
  "charge.dispute.closed": { icon: ShieldAlert, color: "text-muted-foreground", label: "Disputa encerrada" },
  "payment_intent.succeeded": { icon: CheckCircle2, color: "text-emerald-500", label: "Pagamento OK" },
  "payment_intent.payment_failed": { icon: AlertCircle, color: "text-destructive", label: "Pagamento falhou" },
};

function Kpi({ label, value, hint, icon: Icon, accent }: {
  label: string; value: string; hint?: string; icon: typeof Activity;
  accent?: "ok" | "warn" | "danger";
}) {
  const color =
    accent === "danger" ? "text-destructive" :
    accent === "warn" ? "text-amber-500" :
    accent === "ok" ? "text-emerald-500" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function AdminStripePage() {
  const [period, setPeriod] = useState<Period>("7d");
  const [filterType, setFilterType] = useState<string>("");
  const qc = useQueryClient();

  const fetchKpis = useServerFn(getStripeKpis);
  const fetchEvents = useServerFn(listStripeEvents);
  const runBackfill = useServerFn(syncStripeBackfill);

  const kpis = useQuery({
    queryKey: ["admin-stripe-kpis", period],
    queryFn: () => fetchKpis({ data: { period } }),
    refetchInterval: 60_000,
  });

  const events = useQuery({
    queryKey: ["admin-stripe-events", filterType],
    queryFn: () => fetchEvents({ data: { limit: 50, type: filterType || undefined } }),
    refetchInterval: 30_000,
  });

  const backfill = useMutation({
    mutationFn: () => runBackfill({ data: { days: 30 } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-stripe-events"] });
      qc.invalidateQueries({ queryKey: ["admin-stripe-kpis"] });
    },
  });

  // Realtime: novos eventos chegando → revalida lista e KPIs
  useEffect(() => {
    const channel = supabase
      .channel("admin-stripe-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "stripe_events" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-stripe-events"] });
        qc.invalidateQueries({ queryKey: ["admin-stripe-kpis"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const k = kpis.data;
  const ccy = k?.balance_currency ?? "BRL";

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold mb-1">Stripe — ao vivo</h2>
          <p className="text-sm text-muted-foreground">
            Tudo que acontece na sua conta Stripe em tempo real.
            {k?.generated_at && (
              <> · Atualizado {new Date(k.generated_at).toLocaleTimeString("pt-BR")}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
            {(["today", "7d", "30d"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 transition ${period === p ? "bg-primary text-primary-foreground" : "bg-card hover:bg-foreground/5"}`}
              >
                {p === "today" ? "Hoje" : p === "7d" ? "7 dias" : "30 dias"}
              </button>
            ))}
          </div>
          <button
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-foreground/5 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${backfill.isPending ? "animate-spin" : ""}`} />
            {backfill.isPending ? "Sincronizando…" : "Importar 30d"}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Kpi label="Receita líquida" value={kpis.isLoading ? "…" : fmtBRL(k?.net_revenue_cents ?? 0, ccy)} hint={`Bruto ${fmtBRL(k?.gross_revenue_cents ?? 0, ccy)}`} icon={DollarSign} accent="ok" />
        <Kpi label="MRR" value={kpis.isLoading ? "…" : fmtBRL(k?.mrr_cents ?? 0)} hint="Receita recorrente normalizada/mês" icon={TrendingUp} />
        <Kpi label="Assinaturas ativas" value={String(k?.active_subs ?? 0)} hint={`${k?.trialing_subs ?? 0} em trial`} icon={Users} accent="ok" />
        <Kpi label="Em atraso" value={String(k?.past_due_subs ?? 0)} hint={`Churn ${k?.churn_pct ?? 0}% · ${k?.canceled_in_period ?? 0} cancelaram`} icon={AlertTriangle} accent={(k?.past_due_subs ?? 0) > 0 ? "warn" : undefined} />
        <Kpi label="Ticket médio" value={fmtBRL(k?.avg_ticket_cents ?? 0, ccy)} hint={`${k?.success_charges ?? 0} cobranças`} icon={CreditCard} />
        <Kpi label="Reembolsos" value={`${k?.refunds_count ?? 0} · ${fmtBRL(k?.refunded_cents ?? 0, ccy)}`} icon={RefreshCw} accent={(k?.refunds_count ?? 0) > 0 ? "warn" : undefined} />
        <Kpi label="Disputas abertas" value={`${k?.open_disputes ?? 0} · ${fmtBRL(k?.dispute_amount_cents ?? 0, ccy)}`} icon={ShieldAlert} accent={(k?.open_disputes ?? 0) > 0 ? "danger" : undefined} />
        <Kpi label="Saldo Stripe" value={fmtBRL(k?.balance_available_cents ?? 0, ccy)} hint={`+ ${fmtBRL(k?.balance_pending_cents ?? 0, ccy)} pendente`} icon={DollarSign} />
      </div>

      {/* Feed */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border flex-wrap">
          <div>
            <h3 className="font-bold">Atividade ao vivo</h3>
            <p className="text-xs text-muted-foreground">Atualiza sozinho quando algo acontece</p>
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            <option value="">Todos os eventos</option>
            {Object.entries(EVENT_META).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {events.isLoading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Carregando…</div>
        ) : (events.data?.length ?? 0) === 0 ? (
          <div className="p-10 text-center">
            <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-semibold mb-1">Nenhum evento ainda</p>
            <p className="text-xs text-muted-foreground mb-4">
              Os eventos aparecem aqui automaticamente. Para popular com histórico, clique em "Importar 30d".
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {(events.data ?? []).map((e) => {
              const meta = EVENT_META[e.type] ?? { icon: Activity, color: "text-muted-foreground", label: e.type };
              const Icon = meta.icon;
              const amount = e.amount_cents != null
                ? fmtBRL(e.amount_cents, (e.currency ?? "brl").toUpperCase())
                : null;
              const stripeUrl =
                e.charge_id ? `https://dashboard.stripe.com/${e.livemode ? "" : "test/"}payments/${e.payment_intent_id ?? e.charge_id}` :
                e.invoice_id ? `https://dashboard.stripe.com/${e.livemode ? "" : "test/"}invoices/${e.invoice_id}` :
                e.subscription_id ? `https://dashboard.stripe.com/${e.livemode ? "" : "test/"}subscriptions/${e.subscription_id}` :
                e.session_id ? `https://dashboard.stripe.com/${e.livemode ? "" : "test/"}payments?session=${e.session_id}` :
                null;
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3 hover:bg-foreground/5 transition">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{meta.label}</span>
                      {!e.livemode && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-500">test</span>
                      )}
                      {amount && <span className="text-sm font-bold">{amount}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {e.customer_email ?? e.customer_id ?? "—"}
                      {e.reason && <> · {e.reason}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-muted-foreground">{fmtTime(e.occurred_at)}</p>
                    {stripeUrl && (
                      <a
                        href={stripeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-primary font-semibold inline-flex items-center gap-1 hover:underline"
                      >
                        Stripe <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
