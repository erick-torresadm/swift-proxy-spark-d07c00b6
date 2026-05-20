import { createFileRoute } from "@tanstack/react-router";
import { ServerCog } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/provider")({
  component: () => (
    <div>
      <h2 className="text-xl font-bold mb-6">Provedor (Proxy-Seller)</h2>
      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <ServerCog className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Saldo na Proxy-Seller, histórico de compras de lotes (custo × receita) e log de chamadas à API.
        </p>
      </div>
    </div>
  ),
});
