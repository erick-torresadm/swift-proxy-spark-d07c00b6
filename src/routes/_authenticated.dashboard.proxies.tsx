import { createFileRoute } from "@tanstack/react-router";
import { Server } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard/proxies")({
  component: ProxiesPage,
  head: () => ({ meta: [{ title: "Meus proxies — FastProxy" }] }),
});

function ProxiesPage() {
  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl sm:text-3xl font-black mb-1">Meus proxies</h1>
      <p className="text-muted-foreground mb-8">
        Lista de proxies ativos com credenciais e ações.
      </p>

      <div className="bg-card border border-border rounded-2xl p-10 text-center">
        <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Nenhum proxy ativo. Após a contratação eles aparecem aqui automaticamente.
        </p>
      </div>
    </div>
  );
}
