import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
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
  setManualStockStatus,
  type Ipv6BrSource,
  type ProxySellerSource,
} from "@/lib/vps-admin.functions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ServerCog, CheckCircle2, AlertCircle, PlusCircle, PackagePlus, Trash2, Cloud, Globe, Copy, Ban, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/vps")({
  head: () => ({
    meta: [
      { title: "Fornecimento de Proxies — Admin FastProxy" },
      {
        name: "description",
        content: "Controle as fontes de estoque, VPS própria e API externa para entrega de proxies FastProxy.",
      },
      { property: "og:title", content: "Fornecimento de Proxies — Admin FastProxy" },
      {
        property: "og:description",
        content: "Controle as fontes de estoque, VPS própria e API externa para entrega de proxies FastProxy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  const updateStockStatus = useServerFn(setManualStockStatus);
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

  // Legacy 2-way toggle usado só pelas mutações herdadas; a UI usa ipv6SrcMut / psModeMut.
  const modeMut = useMutation({
    mutationFn: (mode: "api" | "stock") => setMode({ data: { mode } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-vps"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
  void modeMut;

  const ipv6SrcMut = useMutation({
    mutationFn: (source: Ipv6BrSource) => setIpv6Src({ data: { source } }),
    onSuccess: (r) => {
      toast.success(
        r.source === "stock"
          ? "IPv6 BR → Estoque manual (não emite/compra novos IPs)"
          : r.source === "vps"
            ? "IPv6 BR → API da VPS própria"
            : "IPv6 BR → configuração bloqueada",
      );
      qc.invalidateQueries({ queryKey: ["admin-vps"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const psModeMut = useMutation({
    mutationFn: (mode: ProxySellerSource) => setPsMode({ data: { mode } }),
    onSuccess: (r) => {
      toast.success(
        r.mode === "stock"
          ? "ProxySeller (IPv4/ISP/USA) → Estoque manual"
          : "ProxySeller (IPv4/ISP/USA) → API ao vivo",
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

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "available" | "removed" }) =>
      updateStockStatus({ data: { id, status } }),
    onSuccess: (r) => {
      toast.success(r.status === "removed" ? "IP marcado como indisponível" : "IP voltou para disponível");
      qc.invalidateQueries({ queryKey: ["admin-vps-manual-stock"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const health = data ? tryJson(data.healthJson) : null;
  const vpsBlocks = data ? (tryJson(data.vpsBlocksJson) as unknown[]) ?? [] : [];
  const sourceMode = data?.sourceMode ?? "api";
  const ipv6BrSource: Ipv6BrSource = data?.ipv6BrSource ?? (sourceMode === "stock" ? "stock" : "vps");
  const proxysellerSource: ProxySellerSource = data?.proxysellerSource ?? "api";
  const isStockMode = ipv6BrSource === "stock";
  const isProxySellerForIpv6Br = ipv6BrSource === "proxyseller";

  const formatProxy = (r: { host: string; port: number; username?: string | null; password?: string | null }) => {
    if (r.username && r.password) return `${r.username}:${r.password}@${r.host}:${r.port}`;
    return `${r.host}:${r.port}`;
  };

  const copyProxy = async (proxy: string) => {
    if (!navigator.clipboard) {
      toast.error("Seu navegador não liberou copiar automaticamente");
      return;
    }
    await navigator.clipboard.writeText(proxy);
    toast.success("Proxy copiado");
  };

  const statusLabel = (status: string) => {
    if (status === "available") return "disponível";
    if (status === "allocated") return "em uso";
    if (status === "removed") return "indisponível";
    if (status === "expired") return "expirado";
    return status;
  };

  const sourceBtn = (opts: {
    active: boolean;
    disabled?: boolean;
    onClick: () => void;
    icon: ReactNode;
    title: string;
    desc: string;
  }) => (
    <button
      className={`text-left rounded-lg border p-3 transition-colors ${opts.active ? "border-primary bg-primary/5" : "hover:bg-accent/40"} disabled:opacity-50`}
      disabled={opts.disabled}
      onClick={opts.onClick}
    >
      <div className="font-medium flex items-center gap-2">
        {opts.icon} {opts.title}
        {opts.active && <span className="ml-auto text-xs text-primary">ATIVO</span>}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{opts.desc}</div>
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <ServerCog className="h-5 w-5" /> Fornecimento de proxies
        </h2>
        <p className="text-sm text-muted-foreground">
          Escolha em cada família de plano de onde os IPs vão sair. Você pode trocar a qualquer momento — o painel já usa a nova fonte na próxima venda/renovação.
        </p>
      </div>

      {/* IPv6 BR family — own stock/VPS only */}
      <div className="rounded-lg border p-4">
        <div className="font-medium mb-1">IPv6 BR (planos <code>ipv6-br</code>, <code>ipv6-fb-br</code> e <code>ipv6-rot-br</code>)</div>
        <div className="text-xs text-muted-foreground mb-3">
          Fonte atual: <b>{ipv6BrSource === "stock" ? "Estoque manual" : ipv6BrSource === "vps" ? "API VPS própria" : "configuração antiga ProxySeller — trocar para VPS/Estoque"}</b>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sourceBtn({
            active: ipv6BrSource === "stock",
            disabled: ipv6SrcMut.isPending,
            onClick: () => ipv6SrcMut.mutate("stock"),
            icon: <PackagePlus className="h-4 w-4" />,
            title: "Estoque manual",
            desc: "Você cola os IPs abaixo; painel entrega e avisa quando estiver baixo. Nunca compra novo.",
          })}
          {sourceBtn({
            active: ipv6BrSource === "vps",
            disabled: ipv6SrcMut.isPending,
            onClick: () => ipv6SrcMut.mutate("vps"),
            icon: <ServerCog className="h-4 w-4" />,
            title: "API VPS própria",
            desc: "Cada venda pede à sua VPS um bloco novo. Precisa da API da VPS online.",
          })}
        </div>
        {isProxySellerForIpv6Br && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            IPv6 BR não deve sair da ProxySeller. Selecione Estoque manual ou API VPS própria.
          </div>
        )}
      </div>

      {/* ProxySeller family — 2 sources */}
      <div className="rounded-lg border p-4">
        <div className="font-medium mb-1 flex items-center gap-2">
          <Globe className="h-4 w-4" /> ProxySeller (IPv4 BR/USA, ISP, IPv6 USA, IPv6 FB USA)
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          Fonte atual: <b>{proxysellerSource === "stock" ? "Estoque manual" : "API ProxySeller"}</b>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {sourceBtn({
            active: proxysellerSource === "stock",
            disabled: psModeMut.isPending,
            onClick: () => psModeMut.mutate("stock"),
            icon: <PackagePlus className="h-4 w-4" />,
            title: "Estoque manual",
            desc: "Entrega só do pool que você colou. Se acabar, admin recebe alerta no PWA — sem compra automática.",
          })}
          {sourceBtn({
            active: proxysellerSource === "api",
            disabled: psModeMut.isPending,
            onClick: () => psModeMut.mutate("api"),
            icon: <Cloud className="h-4 w-4" />,
            title: "API ProxySeller",
            desc: "Compra automática na ProxySeller quando o estoque acabar (comportamento padrão).",
          })}
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
                  <th>Proxy</th>
                  <th>Prot</th>
                  <th>Status</th>
                  <th>Expira</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(stockRows ?? []).map((r) => {
                  const proxy = formatProxy(r);
                  const canEdit = r.status !== "allocated";
                  const nextStatus = r.status === "removed" ? "available" : "removed";
                  return (
                    <tr key={r.id} className="border-b align-top">
                      <td className="py-2 pr-3">{r.product_name ?? "—"}</td>
                      <td className="font-mono py-2 pr-3 max-w-[360px] break-all">{proxy}</td>
                      <td className="py-2 pr-3">{r.protocol ?? "—"}</td>
                      <td className="py-2 pr-3">{statusLabel(r.status)}</td>
                      <td className="py-2 pr-3">{r.expires_at ? new Date(r.expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => void copyProxy(proxy)}
                          >
                            <Copy className="h-3 w-3" /> Copiar
                          </Button>
                          {canEdit && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={statusMut.isPending}
                              onClick={() => statusMut.mutate({ id: r.id, status: nextStatus })}
                            >
                              {nextStatus === "removed" ? <Ban className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
                              {nextStatus === "removed" ? "Indisponível" : "Disponível"}
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs"
                              disabled={deleteMut.isPending}
                              onClick={() => {
                                if (confirm(`Remover ${proxy}?`)) deleteMut.mutate(r.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" /> Remover
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API-mode specifics */}
      <div className={`rounded-lg border p-4 flex items-center justify-between ${(isStockMode || isProxySellerForIpv6Br) ? "opacity-60" : ""}`}>
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

      <div className={`rounded-lg border p-4 space-y-3 ${(isStockMode || isProxySellerForIpv6Br) ? "opacity-60" : ""}`}>
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
          disabled={!productId || issueMut.isPending || size < 1 || days < 1 || isStockMode || isProxySellerForIpv6Br}
          onClick={() => issueMut.mutate()}
        >
          {issueMut.isPending ? "Emitindo…" : "Emitir bloco"}
        </button>
      </div>

      <div className={`rounded-lg border p-4 ${(isStockMode || isProxySellerForIpv6Br) ? "opacity-60" : ""}`}>
        <div className="font-medium mb-2">Saúde da API</div>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : data?.healthOk ? (
          <pre className="text-xs bg-muted p-3 rounded overflow-auto">{JSON.stringify(health, null, 2)}</pre>
        ) : (
          <div className="text-sm text-red-600">Erro: {data?.healthError ?? "?"}</div>
        )}
      </div>

      <div className={`rounded-lg border p-4 ${(isStockMode || isProxySellerForIpv6Br) ? "opacity-60" : ""}`}>
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
