import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";
import { listAllOrders } from "@/lib/inventory.functions";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: OrdersPage,
});

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusColor: Record<string, string> = {
  paid: "bg-green-500/15 text-green-500",
  pending: "bg-amber-500/15 text-amber-500",
  past_due: "bg-red-500/15 text-red-500",
  grace: "bg-amber-500/15 text-amber-500",
  cancelled: "bg-muted/30 text-muted-foreground",
  expired: "bg-muted/30 text-muted-foreground",
};

function OrdersPage() {
  const fn = useServerFn(listAllOrders);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => fn(),
    refetchInterval: 30000,
  });

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Pedidos</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Últimos 100 pedidos com status do Stripe e carência de inadimplência.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!isLoading && (data ?? []).length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum pedido ainda.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-bold">Produto</th>
                <th className="px-4 py-3 font-bold">Valor</th>
                <th className="px-4 py-3 font-bold">Ciclo</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Vence em</th>
                <th className="px-4 py-3 font-bold">Carência até</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((o) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="px-4 py-3">{o.products?.name ?? o.products?.slug ?? "—"}</td>
                  <td className="px-4 py-3 font-bold">{fmtBRL(o.amount_cents)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{o.billing_cycle}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        statusColor[o.status] ?? "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {o.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.current_period_end
                      ? new Date(o.current_period_end).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {o.grace_until ? new Date(o.grace_until).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
