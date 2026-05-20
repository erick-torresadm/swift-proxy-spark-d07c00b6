import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  component: () => (
    <div>
      <h2 className="text-xl font-bold mb-6">Clientes</h2>
      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Listagem de clientes com drill-down em pedidos e proxies ativos.
        </p>
      </div>
    </div>
  ),
});
