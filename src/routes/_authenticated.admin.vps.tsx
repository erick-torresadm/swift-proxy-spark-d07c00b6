import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getVpsStatus,
  setVpsEnabled,
  setVpsSourceMode,
  setIpv6BrSource,
  setProxySellerSourceMode,
  listVpsProducts,
  issueVpsBlock,
  importManualStock,
  listManualStock,
  deleteManualStock,
  type Ipv6BrSource,
  type ProxySellerSource,
} from "@/lib/vps-admin.functions";
import { toast } from "sonner";
import { ServerCog, CheckCircle2, AlertCircle, PlusCircle, PackagePlus, Trash2, Cloud, Globe } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/vps")({
  component: VpsAdmin,
});

function VpsAdmin() {
  const fetchStatus = useServerFn(getVpsStatus);
  const fetchProducts = useServerFn(listVpsProducts);
  const issue = useServerFn(issueVpsBlock);
  const toggle = useServerFn(setVpsEnabled);
  const setMode = useServerFn(setVpsSourceMode);
  const setIpv6Src = useServerFn(setIpv6BrSource);
  const setPsMode = useServerFn(setProxySellerSourceMode);
  const importStock = useServerFn(importManualStock);
  const fetchStock = useServerFn(listManualStock);
  const removeStock = useServerFn(deleteManualStock);
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
  const { data: stockRows } = useQuery({
    queryKey: ["admin-vps-manual-stock"],
    queryFn: () => fetchStock(),
    refetchInterval: 30000,
  });

  const mut = useMutation({
    mutationFn: (enabled: boolean) => toggle({ data: { enabled } }),
    onSuccess: (r) => {
      toast.success(r.enabled ? "VPS ativada" : "VPS desligada");
      qc.invalidateQueries({ queryKey: ["admin-vps"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const modeMut = useMutation({
    mutationFn: (mode: "api" | "stock") => setMode({ data: { mode } }),
    onSuccess: (r) => {
      toast.success(
        r.mode === "stock"
          ? "Modo Estoque manual — novos IPv6 saem do estoque"
          : "Modo API — novos IPv6 são emitidos direto na VPS",
      );
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

  // Manual stock import
  const [stockProductId, setStockProductId] = useState<string>("");
  const [stockRaw, setStockRaw] = useState<string>("");
  const [stockProtocol, setStockProtocol] = useState<string>("http");
  const [stockDays, setStockDays] = useState<number>(30);
  const [stockUser, setStockUser] = useState<string>("");
  const [stockPass, setStockPass] = useState<string>("");

  const importMut = useMutation({
    mutationFn: () =>
      importStock({
        data: {
          product_id: stockProductId,
          raw: stockRaw,
          protocol: stockProtocol,
          duration_days: stockDays,
          default_username: stockUser || undefined,
          default_password: stockPass || undefined,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.inserted} IPs adicionados${r.duplicates ? ` · ${r.duplicates} duplicado(s)` : ""}${r.invalid ? ` · ${r.invalid} inválido(s)` : ""}`,
      );
      if (r.inserted > 0) setStockRaw("");
      qc.invalidateQueries({ queryKey: ["admin-vps-manual-stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => removeStock({ data: { id } }),
    onSuccess: () => {
      toast.success("IP removido");
      qc.invalidateQueries({ queryKey: ["admin-vps-manual-stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const health = data ? tryJson(data.healthJson) : null;
  const vpsBlocks = data ? (tryJson(data.vpsBlocksJson) as unknown[]) ?? [] : [];
  const sourceMode = data?.sourceMode ?? "api";
  const isStockMode = sourceMode === "stock";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <ServerCog className="h-5 w-5" /> VPS IPv6 BR — Auto-hospedado
        </h2>
        <p className="text-sm text-muted-foreground">
          Escolha como os IPv6 BR vão ser entregues: emitidos direto na VPS (API) ou puxados de um estoque manual que você cola aqui.
        </p>
      </div>

      {/* Source mode toggle */}
      <div className="rounded-lg border p-4">
        <div className="font-medium mb-3">Modo de fornecimento (IPv6 BR)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            className={`text-left rounded-lg border p-3 transition-colors ${sourceMode === "api" ? "border-primary bg-primary/5" : "hover:bg-accent/40"}`}
            disabled={modeMut.isPending}
            onClick={() => modeMut.mutate("api")}
          >
            <div className="font-medium flex items-center gap-2">
              <ServerCog className="h-4 w-4" /> API (VPS emite ao vivo)
              {sourceMode === "api" && <span className="ml-auto text-xs text-primary">ATIVO</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Cada nova venda chama a VPS para criar bloco. Precisa da API online.
            </div>
          </button>
          <button
            className={`text-left rounded-lg border p-3 transition-colors ${sourceMode === "stock" ? "border-primary bg-primary/5" : "hover:bg-accent/40"}`}
            disabled={modeMut.isPending}
            onClick={() => modeMut.mutate("stock")}
          >
            <div className="font-medium flex items-center gap-2">
              <PackagePlus className="h-4 w-4" /> Estoque manual
              {sourceMode === "stock" && <span className="ml-auto text-xs text-primary">ATIVO</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Você cola os IPs; o painel entrega, renova e avisa via PWA quando estoque está baixo.
            </div>
          </button>
        </div>
      </div>

      {/* Manual stock — always visible; import even in API mode as backup */}
      <div className="rounded-lg border p-4 space-y-3">
        <div className="font-medium flex items-center gap-2">
          <PackagePlus className="h-4 w-4" /> Adicionar IPs ao estoque manual
        </div>
        <p className="text-xs text-muted-foreground">
          Cole 1 IP por linha. Aceita <code>host:port</code>, <code>host:port:user:pass</code> ou <code>user:pass@host:port</code>. Duplicados são ignorados.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Produto</label>
            <select
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              value={stockProductId}
              onChange={(e) => setStockProductId(e.target.value)}
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
            <label className="text-xs text-muted-foreground">Protocolo</label>
            <select
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              value={stockProtocol}
              onChange={(e) => setStockProtocol(e.target.value)}
            >
              <option value="http">HTTP</option>
              <option value="socks5">SOCKS5</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Validade (dias)</label>
            <input
              type="number"
              min={1}
              max={3650}
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              value={stockDays}
              onChange={(e) => setStockDays(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">User padrão (opcional)</label>
            <input
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              placeholder="usado quando a linha não trouxer user"
              value={stockUser}
              onChange={(e) => setStockUser(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Senha padrão (opcional)</label>
            <input
              className="w-full mt-1 rounded-md border bg-background px-2 py-2 text-sm"
              placeholder="usado quando a linha não trouxer senha"
              value={stockPass}
              onChange={(e) => setStockPass(e.target.value)}
            />
          </div>
        </div>
        <textarea
          className="w-full min-h-[120px] rounded-md border bg-background px-2 py-2 text-sm font-mono"
          placeholder="Ex: 104.234.186.95:11000:user:pass"
          value={stockRaw}
          onChange={(e) => setStockRaw(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
            disabled={!stockProductId || !stockRaw.trim() || importMut.isPending}
            onClick={() => importMut.mutate()}
          >
            {importMut.isPending ? "Importando…" : "Importar IPs"}
          </button>
          <span className="text-xs text-muted-foreground">
            {stockRaw.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith("#")).length} linha(s) para importar
          </span>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="font-medium mb-2">Estoque manual atual ({stockRows?.length ?? 0})</div>
        {(stockRows ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum IP no estoque manual ainda.</div>
        ) : (
          <div className="text-xs overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1">Produto</th>
                  <th>Host:Port</th>
                  <th>User</th>
                  <th>Prot</th>
                  <th>Status</th>
                  <th>Expira</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(stockRows ?? []).map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="py-1">{r.product_name ?? "—"}</td>
                    <td className="font-mono">
                      {r.host}:{r.port}
                    </td>
                    <td className="font-mono">{r.username ?? "—"}</td>
                    <td>{r.protocol ?? "—"}</td>
                    <td>{r.status}</td>
                    <td>{r.expires_at ? new Date(r.expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                    <td>
                      {r.status !== "allocated" && (
                        <button
                          className="text-red-600 hover:underline inline-flex items-center gap-1"
                          disabled={deleteMut.isPending}
                          onClick={() => {
                            if (confirm(`Remover ${r.host}:${r.port}?`)) deleteMut.mutate(r.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> Remover
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API-mode specifics */}
      <div className={`rounded-lg border p-4 flex items-center justify-between ${isStockMode ? "opacity-60" : ""}`}>
        <div>
          <div className="font-medium">Status da API</div>
          <div className="text-sm text-muted-foreground">
            {data?.enabled ? (
              <span className="text-emerald-600 inline-flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" /> Ativa
              </span>
            ) : (
              <span className="text-amber-600 inline-flex items-center gap-1">
                <AlertCircle className="h-4 w-4" /> Desligada (dry-run)
              </span>
            )}
            {isStockMode && <span className="ml-2 text-xs">(sem efeito — modo Estoque)</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            URL: <code>{data?.apiBaseUrl ?? "—"}</code>
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

      <div className={`rounded-lg border p-4 space-y-3 ${isStockMode ? "opacity-60" : ""}`}>
        <div className="font-medium flex items-center gap-2">
          <PlusCircle className="h-4 w-4" /> Emitir novo bloco IPv6 na VPS
        </div>
        <p className="text-xs text-muted-foreground">
          Cria um bloco direto na VPS e ingere os IPs no estoque. Só faz sentido no modo API.
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
        <button
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          disabled={!productId || issueMut.isPending || size < 1 || days < 1 || isStockMode}
          onClick={() => issueMut.mutate()}
        >
          {issueMut.isPending ? "Emitindo…" : "Emitir bloco"}
        </button>
      </div>

      <div className={`rounded-lg border p-4 ${isStockMode ? "opacity-60" : ""}`}>
        <div className="font-medium mb-2">Saúde da API</div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : data?.healthOk ? (
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(health, null, 2)}</pre>
        ) : (
          <div className="text-sm text-red-600">Erro: {data?.healthError ?? "?"}</div>
        )}
      </div>

      <div className={`rounded-lg border p-4 ${isStockMode ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium">Blocos na VPS ({vpsBlocks.length})</div>
          <button className="text-xs underline" onClick={() => refetch()}>Atualizar</button>
        </div>
        <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-64">{JSON.stringify(vpsBlocks, null, 2)}</pre>
      </div>
    </div>
  );
}

function tryJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
