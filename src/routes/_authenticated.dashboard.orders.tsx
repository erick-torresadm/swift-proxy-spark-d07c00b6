import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Receipt, XCircle } from "lucide-react";
import { listMyOrders } from "@/lib/dashboard.functions";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  component: OrdersPage,
  head: () => ({ meta: [{ title: "Pedidos — FastProxy" }] }),
});

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-primary/15 text-primary",
  pending: "bg-amber-400/15 text-amber-400",
  past_due: "bg-amber-500/15 text-amber-400",
  grace: "bg-amber-500/15 text-amber-400",
  cancelled: "bg-destructive/15 text-destructive",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Pago",
  pending: "Pendente",
  past_due: "Em atraso",
  grace: "Carência",
  cancelled: "Cancelado",
};

function OrdersPage() {
  const fetchOrders = useServerFn(listMyOrders);
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: () => fetchOrders(),
    refetchInterval: 60000,
  });

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-1">Pedidos</h1>
          <p className="text-muted-foreground">
            Histórico das suas assinaturas e renovações.
          </p>
        </div>
        <Link
          to="/dashboard/cancelar"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-semibold text-muted-foreground hover:text-destructive hover:border-destructive/40 transition"
        >
          <XCircle className="w-4 h-4" />
          Cancelar assinatura
        </Link>
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Sem pedidos ainda.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Data</th>
                  <th className="text-left px-4 py-3 font-semibold">Produto</th>
                  <th className="text-left px-4 py-3 font-semibold">Qtd</th>
                  <th className="text-left px-4 py-3 font-semibold">Ciclo</th>
                  <th className="text-right px-4 py-3 font-semibold">Valor</th>
                  <th className="text-left px-4 py-3 font-semibold">Renova em</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((o) => (
                  <tr key={o.id} className="border-t border-border/60">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDate(o.created_at)}
                    </td>
                    <td className="px-4 py-3 font-semibold">{o.product_name}</td>
                    <td className="px-4 py-3">
                      {o.quantity}
                      {o.block_size > 1 && (
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          ({o.quantity * o.block_size} IPs)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize">
                      {o.billing_cycle === "yearly" ? "Anual" : "Mensal"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">
                      {formatBRL(o.amount_cents)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {formatDate(o.current_period_end)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          STATUS_STYLE[o.status] ?? "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
