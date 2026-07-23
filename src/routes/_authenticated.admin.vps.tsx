import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getVpsStatus, setVpsEnabled, listVpsProducts, issueVpsBlock } from "@/lib/vps-admin.functions";
import { toast } from "sonner";
import { ServerCog, CheckCircle2, AlertCircle, PlusCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/vps")({
  component: VpsAdmin,
});

function VpsAdmin() {
  const fetchStatus = useServerFn(getVpsStatus);
  const fetchProducts = useServerFn(listVpsProducts);
  const issue = useServerFn(issueVpsBlock);
  const toggle = useServerFn(setVpsEnabled);
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-vps"],
    queryFn: () => fetchStatus(),
    refetchInterval: 30000,
  });
  const { data: products } = useQuery({
    queryKey: ["admin-vps-products"],
    queryFn: () => fetchProducts(),
  });

  const mut = useMutation({
    mutationFn: (enabled: boolean) => toggle({ data: { enabled } }),
    onSuccess: (r) => {
      toast.success(r.enabled ? "VPS ativada — novos IPv6 BR virão daqui" : "VPS desligada");
      qc.invalidateQueries({ queryKey: ["admin-vps"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const [productId, setProductId] = useState<string>("");
  const [size, setSize] = useState<number>(10);
  const [days, setDays] = useState<number>(30);

  const issueMut = useMutation({
    mutationFn: () => issue({ data: { product_id: productId, size, duration_days: days } }),
    onSuccess: (r) => {
      toast.success(
        r.pending
          ? `Bloco ${r.blockId.slice(0, 8)} criado (aguardando IPs da VPS)`
          : `Bloco emitido: ${r.added} IPs adicionados ao estoque`,
      );
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
          <div className="text-xs text-muted-foreground mt-1">
            URL usada pelo backend: <code>{data?.apiBaseUrl ?? "http://104.234.186.95:8888"}</code>
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

      <div className="rounded-lg border p-4 space-y-3">
        <div className="font-medium flex items-center gap-2">
          <PlusCircle className="h-4 w-4" /> Emitir novo bloco IPv6 na VPS
        </div>
        <p className="text-xs text-muted-foreground">
          Cria um bloco novo direto na sua VPS e ingere os IPs no estoque como <strong>disponíveis</strong>. Útil para pré-abastecer antes de campanhas ou repor manualmente. Só mostra produtos marcados como <code>fastproxy_vps</code>.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Produto</label>
            <select
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">Selecione…</option>
              {(products ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.slug ?? p.id.slice(0, 8)} {p.country_code ? `(${p.country_code})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tamanho (IPs)</label>
            <input
              type="number" min={1} max={256}
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              value={size}
              onChange={(e) => setSize(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Duração (dias)</label>
            <input
              type="number" min={1} max={365}
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
            disabled={!productId || issueMut.isPending || size < 1 || days < 1}
            onClick={() => issueMut.mutate()}
          >
            {issueMut.isPending ? "Emitindo…" : "Emitir bloco"}
          </button>
          {(products ?? []).length === 0 && (
            <span className="text-xs text-amber-600">
              Nenhum produto marcado como <code>fastproxy_vps</code> encontrado.
            </span>
          )}
        </div>
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
