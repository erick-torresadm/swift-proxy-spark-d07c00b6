import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Server, Copy, Check, Download, Search, RefreshCw, AlertCircle, Maximize2, Flag, Activity, ShoppingCart, Pencil } from "lucide-react";
import { listMyProxies, rotateProxyIp, createReactivateCheckout, syncMyAllocations, setProxyLabel, testProxyNow } from "@/lib/dashboard.functions";
import { reportProxyIssue } from "@/lib/admin-ops.functions";
import { getMyProxiesHealth } from "@/lib/health.functions";
import { BuyMoreDialog } from "@/components/buy-more-dialog";
import { toast } from "sonner";

function HealthBadge({ stockId, health }: { stockId: string | null; health?: Record<string, { last_ok: boolean | null; uptime_24h: number | null; last_latency_ms: number | null; samples_24h: number }> }) {
  const h = stockId ? health?.[stockId] : undefined;
  if (!h || h.samples_24h === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted-foreground/15 text-muted-foreground" title="Aguardando primeira checagem">
        <Activity className="w-3 h-3" /> —
      </span>
    );
  }
  const up = h.uptime_24h ?? 0;
  // Última checagem manda: uma média de 24h fica "presa" a falhas antigas
  // (ex: bug de classificação já corrigido) por horas depois do problema
  // já ter sumido. O status atual reflete a realidade, o % é só contexto.
  const healthy = h.last_ok === true;
  const color = healthy
    ? "bg-primary/15 text-primary"
    : up >= 90 ? "bg-amber-400/15 text-amber-400" : "bg-red-500/15 text-red-400";
  const label = healthy ? "Saudável" : up >= 90 ? "Degradado" : "Offline";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${color}`}
      title={`Uptime 24h: ${up.toFixed(1)}%${h.last_latency_ms ? ` · ${h.last_latency_ms}ms` : ""}`}
    >
      <Activity className="w-3 h-3" /> {label} {up.toFixed(0)}%
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/dashboard/proxies")({
  component: ProxiesPage,
  head: () => ({ meta: [{ title: "Meus proxies — FastProxy" }] }),
});


type Proxy = Awaited<ReturnType<typeof listMyProxies>>[number];

function formatLine(p: Proxy) {
  if (!p.host || !p.port) return "";
  if (p.username && p.password) {
    return `${p.username}:${p.password}@${p.host}:${p.port}`;
  }
  return `${p.host}:${p.port}`;
}

function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        toast.success("Copiado!");
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

function LabelCell({ proxyId, value, onSaved }: { proxyId: string; value: string | null; onSaved: (label: string | null) => void }) {
  const setLabelFn = useServerFn(setProxyLabel);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const save = useMutation({
    mutationFn: (label: string | null) => setLabelFn({ data: { proxyId, label } }),
    onSuccess: (r) => {
      onSaved(r.label);
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => save.mutate(draft.trim() || null)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        maxLength={40}
        placeholder="Ex: Conta Instagram 1"
        className="w-full text-xs px-1.5 py-0.5 rounded border border-primary/60 bg-background outline-none"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
      title="Clique pra dar um nome/tag pra esse proxy"
    >
      {value ? (
        <span className="px-1.5 py-0.5 rounded bg-foreground/5 font-medium text-foreground">{value}</span>
      ) : (
        <span className="italic opacity-60">adicionar tag</span>
      )}
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition" />
    </button>
  );
}

function TestNowButton({ proxyId }: { proxyId: string }) {
  const testFn = useServerFn(testProxyNow);
  const test = useMutation({
    mutationFn: () => testFn({ data: { proxyId } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Funcionando! ${r.country ?? ""} · ${r.latency_ms}ms`.trim());
      else toast.error("Proxy não respondeu agora. Vamos investigar.");
    },
    onError: () => toast.error("Não deu pra testar agora, tenta de novo."),
  });
  return (
    <button
      onClick={() => test.mutate()}
      disabled={test.isPending}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 disabled:opacity-50 transition"
      title="Testar conexão agora"
    >
      <Activity className={`w-3.5 h-3.5 ${test.isPending ? "animate-pulse" : ""}`} />
      {test.isPending ? "Testando…" : "Testar"}
    </button>
  );
}

function ProxiesPage() {
  const fetchProxies = useServerFn(listMyProxies);
  const fetchHealth = useServerFn(getMyProxiesHealth);
  const rotateFn = useServerFn(rotateProxyIp);
  const reactivateFn = useServerFn(createReactivateCheckout);
  const reportFn = useServerFn(reportProxyIssue);
  const syncFn = useServerFn(syncMyAllocations);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["my-proxies"],
    queryFn: () => fetchProxies(),
    // Quando vazio, atualiza a cada 15s (cobre o tempo de provisionamento do provedor)
    refetchInterval: (q) => ((q.state.data?.length ?? 0) === 0 ? 15000 : 60000),
  });
  const { data: health } = useQuery({
    queryKey: ["my-proxies-health"],
    queryFn: () => fetchHealth(),
    refetchInterval: 60000,
    enabled: (data?.length ?? 0) > 0,
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      if (r.allocated > 0) {
        toast.success(`${r.allocated} proxies sincronizados!`);
      } else if (r.pending) {
        toast.info(
          "Estamos preparando seus proxies (até 1 min). A página atualiza sozinha.",
          { duration: 6000 },
        );
      } else if (r.error) {
        toast.error(
          "Não conseguimos liberar seus proxies agora. Nossa equipe já foi avisada e em instantes eles aparecem aqui.",
        );
      } else if (r.synced === 0) {
        toast.info("Nenhum pedido pago encontrado.");
      } else {
        toast.info("Estoque ainda não disponível. Tente novamente em alguns instantes.");
      }
      qc.invalidateQueries({ queryKey: ["my-proxies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-tenta sincronizar 1x ao carregar caso esteja sem proxies (corrige race do webhook).
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (isLoading) return;
    if (autoSyncedRef.current) return;
    if ((data?.length ?? 0) === 0) {
      autoSyncedRef.current = true;
      sync.mutate();
    }
  }, [isLoading, data, sync]);

  const rotate = useMutation({
    mutationFn: (proxyId: string) => rotateFn({ data: { proxyId } }),
    onSuccess: (r) => {
      toast.success(`IP rotacionado! Restam ${r.remaining}/${r.cap}`);
      qc.invalidateQueries({ queryKey: ["my-proxies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivate = useMutation({
    mutationFn: (orderId: string) => reactivateFn({ data: { orderId } }),
    onSuccess: (r) => {
      if (r.url) window.location.href = r.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const report = useMutation({
    mutationFn: (v: { allocationId: string; message: string }) =>
      reportFn({ data: v }),
    onSuccess: () => toast.success("Reportado. Nossa equipe vai trocar o IP."),
    onError: (e: Error) => toast.error(e.message),
  });

  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [reportMsg, setReportMsg] = useState("");


  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "grace">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const list = data ?? [];
    let out = list;
    if (statusFilter === "active") out = out.filter((p) => p.status === "active" && !p.grace_until);
    if (statusFilter === "grace") out = out.filter((p) => !!p.grace_until);
    if (!query.trim()) return out;
    const q = query.toLowerCase();
    return out.filter(
      (p) =>
        p.host?.toLowerCase().includes(q) ||
        p.product_name.toLowerCase().includes(q) ||
        p.username?.toLowerCase().includes(q) ||
        p.label?.toLowerCase().includes(q),
    );
  }, [data, query, statusFilter]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))));
  }

  function linesFor(list: typeof filtered) {
    return list.map(formatLine).filter(Boolean);
  }

  function downloadList(list = data ?? []) {
    const lines = linesFor(list);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fastproxy-proxies-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyAll(list = data ?? []) {
    const lines = linesFor(list);
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success(`${lines.length} proxies copiados`);
  }

  const selectedProxies = filtered.filter((p) => selected.has(p.id));

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
        <h1 className="text-2xl sm:text-3xl font-black">Meus proxies</h1>
        <div className="flex flex-wrap gap-2">
          <BuyMoreDialog>
            <button className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-glow hover:bg-primary/90 transition">
              <ShoppingCart className="w-4 h-4" /> Comprar mais
            </button>
          </BuyMoreDialog>
          {(data?.length ?? 0) > 0 && (
            <>
              <button
                onClick={() => copyAll()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-foreground/40 text-sm font-semibold transition"
              >
                <Copy className="w-4 h-4" /> Copiar todos
              </button>
              <button
                onClick={() => downloadList()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-foreground/40 text-sm font-semibold transition"
              >
                <Download className="w-4 h-4" /> Baixar .txt
              </button>
            </>
          )}
        </div>
      </div>
      <p className="text-muted-foreground mb-6">
        Use no formato <code className="text-foreground">usuário:senha@host:porta</code>, protocolo{" "}
        <strong className="text-foreground uppercase">
          {Array.from(new Set((data ?? []).map((p) => p.protocol).filter(Boolean))).join(" ou ") || "SOCKS5"}
        </strong>
        {" "}— não use HTTP se seu proxy for SOCKS5, a conexão não vai funcionar.
      </p>

      {(() => {
        const graceProxies = (data ?? []).filter((p) => p.grace_until);
        if (graceProxies.length === 0) return null;
        const orderIds = Array.from(new Set(graceProxies.map((p) => (p as any).order_id ?? "")));
        const firstGrace = graceProxies[0];
        const until = firstGrace.grace_until
          ? new Date(firstGrace.grace_until).toLocaleDateString("pt-BR")
          : null;
        return (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-amber-200">Pagamento em atraso</p>
              <p className="text-sm text-amber-100/80 mt-0.5">
                Reative agora com <strong>20% OFF</strong> e mantenha seus proxies ativos.
                {until && ` Acesso é removido após ${until}.`}
              </p>
            </div>
            <button
              onClick={() => {
                const orderId = (graceProxies[0] as any).order_id;
                if (orderId) reactivate.mutate(orderId);
              }}
              disabled={reactivate.isPending}
              className="px-3 py-2 rounded-lg bg-amber-500 text-amber-950 text-sm font-bold hover:bg-amber-400 disabled:opacity-50 transition"
            >
              {reactivate.isPending ? "Abrindo…" : "Reativar com 20% OFF"}
            </button>
          </div>
        );
      })()}

      {isLoading ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-semibold mb-1">
            {sync.isPending ? "Sincronizando seus proxies…" : "Nenhum proxy ativo ainda"}
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            Acabou de comprar? Em alguns segundos seus proxies aparecem aqui.
            Se demorar, clique em <strong>Sincronizar agora</strong> para forçar.
          </p>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold shadow-glow hover:bg-primary/90 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar por host, produto, usuário ou tag…"
                className="w-full h-10 pl-9 pr-3 rounded-lg border border-border bg-background text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              className="h-10 px-3 rounded-lg border border-border bg-background text-sm sm:w-48"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="grace">Pagamento pendente</option>
            </select>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 text-sm flex-wrap">
              <span className="font-semibold">{selected.size} selecionado{selected.size > 1 ? "s" : ""}</span>
              <button onClick={() => copyAll(selectedProxies)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold hover:bg-primary/15 transition">
                <Copy className="w-3.5 h-3.5" /> Copiar
              </button>
              <button onClick={() => downloadList(selectedProxies)} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold hover:bg-primary/15 transition">
                <Download className="w-3.5 h-3.5" /> Baixar .txt
              </button>
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-muted-foreground hover:text-foreground transition">
                Limpar seleção
              </button>
            </div>
          )}

          {/* Mobile: lista em cards (tabela larga quebra em telas pequenas) */}
          <div className="md:hidden space-y-3">
            {filtered.map((p) => {
              const cap = p.ip_rotations_per_month ?? 0;
              const used = p.ip_rotations_used ?? 0;
              const remaining = Math.max(0, cap - used);
              return (
                <div key={p.id} className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                      className="mt-1 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold truncate">{p.product_name}</div>
                        <span
                          className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            p.status === "active" ? "bg-primary/15 text-primary" : "bg-amber-400/15 text-amber-400"
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground uppercase mb-1">
                        {p.protocol} · {p.country_code}
                      </div>
                      <LabelCell
                        proxyId={p.id}
                        value={p.label}
                        onSaved={(label) =>
                          qc.setQueryData<typeof data>(["my-proxies"], (old) =>
                            old?.map((row) => (row.id === p.id ? { ...row, label } : row)),
                          )
                        }
                      />
                      <div className="mt-2 font-mono text-xs break-all">
                        {p.username}:{p.password}@{p.host}:{p.port}
                      </div>
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <HealthBadge stockId={p.stock_id} health={health} />
                        <TestNowButton proxyId={p.id} />
                        {cap > 0 && (
                          <button
                            onClick={() => rotate.mutate(p.id)}
                            disabled={remaining === 0 || rotate.isPending || p.status !== "active"}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-border hover:border-primary/60 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition"
                            title={`${remaining}/${cap} rotações restantes`}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${rotate.isPending ? "animate-spin" : ""}`} />
                            {remaining}/{cap}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setReportTarget(p.id);
                            setReportMsg("");
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition"
                        >
                          <Flag className="w-3.5 h-3.5" /> Reportar
                        </button>
                        <Link
                          to="/dashboard/proxy/$id/quick"
                          params={{ id: p.id }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition"
                        >
                          <Maximize2 className="w-3.5 h-3.5" /> Abrir
                        </Link>
                        <CopyButton value={formatLine(p)} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="bg-card border border-border rounded-2xl p-6 text-center text-sm text-muted-foreground">
                Nenhum proxy corresponde ao filtro.
              </div>
            )}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block bg-card border border-border rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-background/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th className="text-left px-4 py-3 font-semibold">Produto</th>
                    <th className="text-left px-4 py-3 font-semibold">Host : Porta</th>
                    <th className="text-left px-4 py-3 font-semibold">Usuário</th>
                    <th className="text-left px-4 py-3 font-semibold">Senha</th>
                    <th className="text-left px-4 py-3 font-semibold">Rotação IP</th>
                    <th className="text-left px-4 py-3 font-semibold">Saúde</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => {
                    const cap = p.ip_rotations_per_month ?? 0;
                    const used = p.ip_rotations_used ?? 0;
                    const remaining = Math.max(0, cap - used);
                    return (
                      <tr key={p.id} className="border-t border-border/60">
                        <td className="px-4 py-3">
                          <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelected(p.id)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{p.product_name}</div>
                          <div className="text-[11px] text-muted-foreground uppercase mb-1">
                            {p.protocol} · {p.country_code}
                          </div>
                          <LabelCell
                            proxyId={p.id}
                            value={p.label}
                            onSaved={(label) =>
                              qc.setQueryData<typeof data>(["my-proxies"], (old) =>
                                old?.map((row) => (row.id === p.id ? { ...row, label } : row)),
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {p.host}:{p.port}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{p.username ?? "—"}</td>
                        <td className="px-4 py-3 font-mono text-xs">
                          <span className="select-all">{p.password ?? "—"}</span>
                        </td>
                        <td className="px-4 py-3">
                          {cap > 0 ? (
                            <button
                              onClick={() => rotate.mutate(p.id)}
                              disabled={remaining === 0 || rotate.isPending || p.status !== "active"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-border hover:border-primary/60 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed transition"
                              title={`${remaining}/${cap} rotações restantes`}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${rotate.isPending ? "animate-spin" : ""}`} />
                              {remaining}/{cap}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <HealthBadge stockId={p.stock_id} health={health} />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              p.status === "active"
                                ? "bg-primary/15 text-primary"
                                : "bg-amber-400/15 text-amber-400"
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <TestNowButton proxyId={p.id} />
                            <button
                              onClick={() => {
                                setReportTarget(p.id);
                                setReportMsg("");
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-amber-400 hover:bg-amber-400/10 transition"
                              title="Reportar erro"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                            <Link
                              to="/dashboard/proxy/$id/quick"
                              params={{ id: p.id }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition"
                              title="Abrir tela rápida"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                            </Link>
                            <CopyButton value={formatLine(p)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhum proxy corresponde ao filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {reportTarget && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setReportTarget(null)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black mb-1 flex items-center gap-2">
              <Flag className="w-5 h-5 text-amber-400" /> Reportar erro
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Conte rapidamente o que está acontecendo. Vamos trocar o IP por outro do estoque.
            </p>
            <textarea
              autoFocus
              value={reportMsg}
              onChange={(e) => setReportMsg(e.target.value)}
              rows={3}
              placeholder="Ex: IP bloqueado no Instagram, lentidão, sem conexão…"
              className="w-full p-3 mb-4 rounded-lg border border-border bg-background text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                disabled={reportMsg.trim().length < 2 || report.isPending}
                onClick={() => {
                  report.mutate(
                    { allocationId: reportTarget, message: reportMsg.trim() },
                    { onSuccess: () => setReportTarget(null) },
                  );
                }}
                className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-amber-950 disabled:opacity-50 hover:bg-amber-400 transition"
              >
                {report.isPending ? "Enviando…" : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
