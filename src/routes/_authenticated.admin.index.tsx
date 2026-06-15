import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  Users,
  Package,
  AlertTriangle,
  Activity,
  TrendingUp,
  CreditCard,
  UserCheck,
  Clock,
} from "lucide-react";
import { getAdminKpis } from "@/lib/admin-kpis.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Admin — FastProxy" }] }),
});

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  accent,
  to,
}: {
  label: string;
  value: string | number;
  icon: typeof Activity;
  hint?: string;
  accent?: "ok" | "warn" | "danger";
  to?: string;
}) {
  const accentClass =
    accent === "danger"
      ? "text-destructive"
      : accent === "warn"
        ? "text-amber-500"
        : accent === "ok"
          ? "text-emerald-500"
          : "text-foreground";
  const Body = (
    <div className="bg-card border border-border rounded-2xl p-5 h-full hover:border-primary/40 transition">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{label}</p>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <p className={`text-2xl font-black ${accentClass}`}>{String(value)}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{Body}</Link> : Body;
}

function AdminOverview() {
  const fetchFn = useServerFn(getAdminKpis);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
  });

  const s = data?.stripe;
  const delinquentTotal = (s?.delinquent_subs ?? 0) + (data?.db_past_due ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-1">Visão geral</h2>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? "Carregando métricas…"
            : `Dados do Stripe + banco. Atualizado em ${
                data?.generated_at ? new Date(data.generated_at).toLocaleTimeString("pt-BR") : "—"
              }.`}
        </p>
        {data?.stripe_error && (
          <p className="text-xs text-destructive mt-2 inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Stripe: {data.stripe_error}
          </p>
        )}
      </div>

      {/* Receita / Stripe */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Receita & assinaturas (Stripe)
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Receita 30d"
            value={s ? fmtBRL(s.revenue30d_cents) : "—"}
            hint={s ? `${s.payments30d} pagamentos` : undefined}
            icon={DollarSign}
            accent="ok"
          />
          <StatCard
            label="MRR (estimado)"
            value={s ? fmtBRL(s.mrr_cents) : "—"}
            hint="Receita mensal recorrente normalizada"
            icon={TrendingUp}
            accent="ok"
          />
          <StatCard
            label="Assinaturas ativas"
            value={s?.active_subs ?? "—"}
            hint={s?.trialing_subs ? `+${s.trialing_subs} em trial` : undefined}
            icon={CreditCard}
          />
          <StatCard
            label="Inadimplentes"
            value={delinquentTotal}
            hint={
              s
                ? `${s.delinquent_subs} Stripe · ${data?.db_past_due ?? 0} no banco`
                : `${data?.db_past_due ?? 0} no banco`
            }
            icon={AlertTriangle}
            accent={delinquentTotal > 0 ? "danger" : "ok"}
            to="/admin/inadimplentes"
          />
        </div>
      </section>

      {/* MRR por produto */}
      {s && s.mrr_by_product.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
            MRR por produto (ativos)
          </h3>
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-left text-[11px] uppercase font-bold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2 text-right">Assinaturas</th>
                  <th className="px-4 py-2 text-right">MRR</th>
                  <th className="px-4 py-2 text-right">% do total</th>
                </tr>
              </thead>
              <tbody>
                {s.mrr_by_product.map((p) => {
                  const pct = s.mrr_cents > 0 ? (p.mrr_cents / s.mrr_cents) * 100 : 0;
                  return (
                    <tr key={p.product_id} className="border-t border-border">
                      <td className="px-4 py-2 font-semibold">{p.name}</td>
                      <td className="px-4 py-2 text-right">{p.subs}</td>
                      <td className="px-4 py-2 text-right font-bold text-emerald-500">
                        {fmtBRL(p.mrr_cents)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {pct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-border bg-muted/20 font-bold">
                  <td className="px-4 py-2">Total</td>
                  <td className="px-4 py-2 text-right">{s.active_subs}</td>
                  <td className="px-4 py-2 text-right text-emerald-500">{fmtBRL(s.mrr_cents)}</td>
                  <td className="px-4 py-2 text-right">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Clientes */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Clientes
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Clientes Stripe"
            value={s?.customers ?? "—"}
            hint="Total no Stripe (até 1k)"
            icon={Users}
          />
          <StatCard
            label="Cadastrados no app"
            value={data?.local_customers ?? "—"}
            icon={UserCheck}
            to="/admin/customers"
          />
          <StatCard
            label="Proxies ativos"
            value={data?.active_proxies ?? "—"}
            icon={Activity}
          />
          <StatCard
            label="Cancelados"
            value={s?.canceled_subs ?? "—"}
            hint="Assinaturas a recuperar"
            icon={UserCheck}
            accent={(s?.canceled_subs ?? 0) > 0 ? "warn" : undefined}
            to="/admin/cancelados"
          />
        </div>
      </section>


      {/* Estoque */}
      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
          Estoque de proxies
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Disponível" value={data?.stock_available ?? "—"} icon={Package} />
          <StatCard label="Alocado" value={data?.stock_allocated ?? "—"} icon={Package} />
          <StatCard
            label="Alertas de estoque baixo"
            value={data?.stock_alerts ?? "—"}
            icon={AlertTriangle}
            accent={(data?.stock_alerts ?? 0) > 0 ? "warn" : "ok"}
          />
        </div>
      </section>

      <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
        <p className="font-bold text-foreground mb-2 inline-flex items-center gap-2">
          <Clock className="w-4 h-4" /> Ações rápidas
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <Link to="/admin/inadimplentes" className="text-primary hover:underline">
              Ver e cobrar inadimplentes
            </Link>{" "}
            — envio de email + WhatsApp em 1 clique.
          </li>
          <li>
            <Link to="/admin/customers" className="text-primary hover:underline">
              Lista de clientes
            </Link>{" "}
            com telefone/email e link para detalhe.
          </li>
          <li>
            <Link to="/admin/orders" className="text-primary hover:underline">
              Pedidos recentes
            </Link>
            .
          </li>
        </ul>
      </div>
    </div>
  );
}
