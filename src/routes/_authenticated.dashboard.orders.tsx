import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  component: OrdersPage,
  head: () => ({ meta: [{ title: "Pedidos — FastProxy" }] }),
});

function OrdersPage() {
  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl sm:text-3xl font-black mb-1">Pedidos</h1>
      <p className="text-muted-foreground mb-8">
        Histórico de pedidos, recibos e status de pagamento.
      </p>

      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Sem pedidos ainda.</p>
      </div>
    </div>
  );
}
