import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Users, Package, AlertTriangle, Activity } from "lucide-react";
import { getAdminOverview } from "@/lib/inventory.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Admin — FastProxy" }] }),
});

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AdminOverview() {
  const fetchOverview = useServerFn(getAdminOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 30000,
  });

  const stats = [
    { label: "Receita 30d", value: data ? fmtBRL(data.revenue30d_cents) : "—", icon: DollarSign },
    { label: "Clientes", value: data?.customers ?? "—", icon: Users },
    { label: "Proxies ativos", value: data?.active_proxies ?? "—", icon: Activity },
    { label: "Estoque disponível", value: data?.stock_available ?? "—", icon: Package },
    { label: "Estoque alocado", value: data?.stock_allocated ?? "—", icon: Package },
    { label: "Alertas de estoque", value: data?.stock_alerts ?? "—", icon: AlertTriangle },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Visão geral</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {isLoading ? "Carregando métricas…" : "Métricas em tempo real (atualiza a cada 30s)."}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                {s.label}
              </p>
              <s.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-black">{String(s.value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground space-y-2">
        <p className="font-bold text-foreground">Próximos passos automatizados</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Conectar chave da Proxy-Seller para popular o estoque automaticamente.</li>
          <li>Conectar Stripe para cobrar assinaturas mensais/anuais e detectar inadimplência.</li>
          <li>Cron diário: liberar IPv6 cuja carência de 7 dias expirou (já implementado em SQL).</li>
          <li>Cron horário: renovar pedidos do provedor com auto_renew=true antes de expirarem.</li>
        </ul>
      </div>
    </div>
  );
}
