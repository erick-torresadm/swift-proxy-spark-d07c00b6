import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  component: () => (
    <div>
      <h2 className="text-xl font-bold mb-6">Estoque</h2>
      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Após conectar a API da Proxy-Seller, aqui aparece a lista de proxies por produto,
          quantidade disponível, regras de reposição e botão "Repor agora".
        </p>
      </div>
    </div>
  ),
});
