import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getVpsStatus, setVpsEnabled } from "@/lib/vps-admin.functions";
import { toast } from "sonner";
import { ServerCog, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/vps")({
  component: VpsAdmin,
});

function VpsAdmin() {
  const fetchStatus = useServerFn(getVpsStatus);
  const toggle = useServerFn(setVpsEnabled);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-vps"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30000,
  });

  const mut = useMutation({
    mutationFn: (enabled: boolean) => toggle({ data: { enabled } }),
    onSuccess: (r) => {
      toast.success(r.enabled ? "VPS ativada — novos IPv6 BR virão daqui" : "VPS desligada");
      qc.invalidateQueries({ queryKey: ["admin-vps"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const health = data ? tryJson(data.healthJson) : null;
  const vpsBlocks = data ? (tryJson(data.vpsBlocksJson) as unknown[]) ?? [] : [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <ServerCog className="h-5 w-5" /> VPS IPv6 BR — Auto-hospedado
        </h2>
        <p className="text-sm text-muted-foreground">
          Blocos IPv6 BR emitidos pela nossa VPS (104.234.186.95:8888). Enquanto <strong>Desligado</strong>, novos pedidos IPv6 BR continuam indo para o ProxySeller.
        </p>
      </div>

      <div className="rounded-lg border p-4 flex items-center justify-between">
        <div>
          <div className="font-medium">Status</div>
          <div className="text-sm text-muted-foreground">
            {data?.enabled ? (
              <span className="text-emerald-600 inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Ativa — novos pedidos IPv6 BR vão para a VPS
              </span>
            ) : (
              <span className="text-amber-600 inline-flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> Desligada (dry-run) — pedidos ainda vão para ProxySeller
              </span>
            )}
          </div>
        </div>
        <button
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          disabled={mut.isPending || isLoading}
          onClick={() => mut.mutate(!data?.enabled)}
        >
          {data?.enabled ? "Desligar" : "Ativar"}
        </button>
      </div>

      <div className="rounded-lg border p-4">
        <div className="font-medium mb-2">Saúde da API</div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : data?.healthOk ? (
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(health, null, 2)}</pre>
        ) : (
          <div className="text-sm text-red-600">Erro: {data?.healthError ?? "?"}</div>
        )}
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">Blocos na VPS ({vpsBlocks.length})</div>
          <button className="text-xs underline" onClick={() => refetch()}>Atualizar</button>
        </div>
        <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">{JSON.stringify(vpsBlocks, null, 2)}</pre>
      </div>

      <div className="rounded-lg border p-4">
        <div className="font-medium mb-2">Blocos VPS no nosso banco ({data?.dbBlocks.length ?? 0})</div>
        {(data?.dbBlocks ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum bloco emitido pela VPS ainda.</div>
        ) : (
          <div className="text-xs">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1">ID</th>
                  <th>Ext.</th>
                  <th>Qtd</th>
                  <th>Status</th>
                  <th>Expira</th>
                </tr>
              </thead>
              <tbody>
                {(data?.dbBlocks ?? []).map((b) => (
                  <tr key={b.id} className="border-b">
                    <td className="py-1 font-mono">{b.id.slice(0, 8)}</td>
                    <td className="font-mono">{b.external_order_id ?? "—"}</td>
                    <td>{b.quantity}</td>
                    <td>{b.status ?? "—"}</td>
                    <td>{b.expires_at ? new Date(b.expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function tryJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
