import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ServerCog, AlertCircle, CheckCircle2 } from "lucide-react";
import { getProviderStatus } from "@/lib/inventory.functions";

export const Route = createFileRoute("/_authenticated/admin/provider")({
  component: ProviderPage,
});

function ProviderPage() {
  const fn = useServerFn(getProviderStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-provider"],
    queryFn: () => fn(),
    refetchInterval: 60000,
  });

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Provedor — Proxy-Seller</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Status da integração, saldo na conta e últimas chamadas.
      </p>

      <div className="bg-card border border-border rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <ServerCog className="w-5 h-5 text-primary" />
          <p className="font-bold">Conexão</p>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Verificando…</p>
        ) : data?.api_configured ? (
          <div className="space-y-2">
            <p className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Chave configurada
            </p>
            {data.balance_error ? (
              <p className="text-sm text-amber-500 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> Erro ao consultar saldo: {data.balance_error}
              </p>
            ) : (
              <pre className="text-xs bg-muted/30 rounded-lg p-3 overflow-auto">
                {data.balance_json}
              </pre>
            )}
          </div>
        ) : (
          <p className="text-sm text-amber-500 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Configure <code className="px-1 bg-muted/30 rounded">PROXY_SELLER_API_KEY</code> para
            habilitar compras automáticas e renovação.
          </p>
        )}
      </div>

      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="font-bold mb-3">Últimas chamadas à API</p>
        {(data?.recent_calls ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma chamada ainda.</p>
        ) : (
          <div className="space-y-2">
            {data!.recent_calls.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between text-xs border-b border-border/50 pb-2 last:border-0"
              >
                <div>
                  <p className="font-mono">{c.action}</p>
                  <p className="text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    c.status === "ok"
                      ? "bg-green-500/15 text-green-500"
                      : "bg-red-500/15 text-red-500"
                  }`}
                >
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
