import { createFileRoute } from "@tanstack/react-router";
import { DollarSign, Users, Package, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminOverview,
  head: () => ({ meta: [{ title: "Admin — FastProxy" }] }),
});

const stats = [
  { label: "Receita 30d", value: "R$ 0,00", icon: DollarSign },
  { label: "Clientes ativos", value: "0", icon: Users },
  { label: "Proxies em estoque", value: "0", icon: Package },
  { label: "Alertas de estoque", value: "0", icon: AlertTriangle },
];

function AdminOverview() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Visão geral</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Métricas do negócio e saúde do estoque.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                {s.label}
              </p>
              <s.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-black">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-2xl p-6 text-sm text-muted-foreground">
        Próximas entregas vão preencher esses cards: integração com Proxy-Seller,
        motor de estoque automático, painel de pedidos e clientes.
      </div>
    </div>
  );
}
