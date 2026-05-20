import { createFileRoute } from "@tanstack/react-router";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/orders")({
  component: () => (
    <div>
      <h2 className="text-xl font-bold mb-6">Pedidos</h2>
      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <Receipt className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Todos os pedidos do site com filtros por status, ações de realocação e reembolso.
        </p>
      </div>
    </div>
  ),
});
