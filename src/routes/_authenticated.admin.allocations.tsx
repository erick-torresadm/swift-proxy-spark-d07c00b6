import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Wrench, Search, RefreshCw, Trash2, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  listAllocations,
  adminSwapProxy,
  adminReleaseProxy,
} from "@/lib/admin-ops.functions";

export const Route = createFileRoute("/_authenticated/admin/allocations")({
  component: AllocationsPage,
  head: () => ({ meta: [{ title: "Operação — Admin" }] }),
});

type Alloc = Awaited<ReturnType<typeof listAllocations>>[number];

function AllocationsPage() {
  const fn = useServerFn(listAllocations);
  const swapFn = useServerFn(adminSwapProxy);
  const releaseFn = useServerFn(adminReleaseProxy);
  const qc = useQueryClient();

  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "issues">("all");
  const [confirm, setConfirm] = useState<
    | { type: "swap" | "release"; alloc: Alloc }
    | null
  >(null);
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-allocations"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  const swap = useMutation({
    mutationFn: (v: { allocationId: string; reason: string }) =>
      swapFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`Trocado! Novo IP: ${r.new_host}`);
      qc.invalidateQueries({ queryKey: ["admin-allocations"] });
      qc.invalidateQueries({ queryKey: ["admin-open-issues"] });
      setConfirm(null);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const release = useMutation({
    mutationFn: (v: { allocationId: string; reason: string }) =>
      releaseFn({ data: v }),
    onSuccess: () => {
      toast.success("Liberado");
      qc.invalidateQueries({ queryKey: ["admin-allocations"] });
      setConfirm(null);
      setReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    return (data ?? []).filter((a) => {
      if (statusFilter === "issues" && !a.issue) return false;
      if (!q) return true;
      return (
        a.host?.toLowerCase().includes(q) ||
        a.user_name?.toLowerCase().includes(q) ||
        a.product_name.toLowerCase().includes(q) ||
        a.username?.toLowerCase().includes(q)
      );
    });
  }, [data, filter, statusFilter]);

  const issuesCount = (data ?? []).filter((a) => a.issue).length;

  function openSwap(a: Alloc) {
    setConfirm({ type: "swap", alloc: a });
    setReason(a.issue?.event === "customer_report" ? "Cliente reportou erro" : "");
  }

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div>
          <h2 className="text-2xl font-black flex items-center gap-2">
            <Wrench className="w-6 h-6 text-primary" /> Operação
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Trocar IP defeituoso ou liberar uma alocação em 1 clique.
          </p>
        </div>
        {issuesCount > 0 && (
          <button
            onClick={() => setStatusFilter(statusFilter === "issues" ? "all" : "issues")}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition ${
              statusFilter === "issues"
                ? "bg-amber-500 text-amber-950"
                : "bg-amber-500/15 text-amber-400 border border-amber-500/40"
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            {issuesCount} com problema
          </button>
        )}
      </div>

      <div className="relative my-5">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por host, cliente, produto ou usuário…"
          className="w-full h-11 pl-9 pr-3 rounded-lg border border-border bg-background text-sm"
        />
      </div>

      {isLoading ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-background/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Cliente</th>
                  <th className="text-left px-4 py-3 font-semibold">Produto</th>
                  <th className="text-left px-4 py-3 font-semibold">Host:Porta</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-t border-border/60 ${a.issue ? "bg-amber-500/5" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold">{a.user_name ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {a.user_id.slice(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.product_name}</div>
                      <div className="text-[11px] text-muted-foreground uppercase">
                        {a.protocol} · {a.country_code ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        {a.host}:{a.port}
                        {a.host && (
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${a.host}:${a.port}`);
                              toast.success("Copiado");
                            }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      {a.username && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {a.username}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          a.status === "active"
                            ? "bg-primary/15 text-primary"
                            : "bg-amber-400/15 text-amber-400"
                        }`}
                      >
                        {a.status}
                      </span>
                      {a.issue && (
                        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                          <AlertCircle className="w-3 h-3" />
                          {a.issue.event === "customer_report"
                            ? "Reportado pelo cliente"
                            : a.issue.event}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openSwap(a)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition"
                          title="Trocar por IP do estoque"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Trocar
                        </button>
                        <button
                          onClick={() => {
                            setConfirm({ type: "release", alloc: a });
                            setReason("");
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-bold text-destructive/80 hover:bg-destructive/10 transition"
                          title="Liberar alocação"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      Nenhuma alocação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={() => setConfirm(null)}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black mb-1">
              {confirm.type === "swap" ? "Trocar proxy" : "Liberar alocação"}
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              Cliente: <strong>{confirm.alloc.user_name ?? "—"}</strong>
            </p>
            <p className="text-xs text-muted-foreground font-mono mb-4">
              {confirm.alloc.host}:{confirm.alloc.port}
            </p>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Motivo
            </label>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={
                confirm.type === "swap"
                  ? "Ex: IP bloqueado pelo destino"
                  : "Ex: cliente cancelou"
              }
              className="w-full mt-1 mb-4 p-3 rounded-lg border border-border bg-background text-sm"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
              <button
                disabled={reason.trim().length < 2 || swap.isPending || release.isPending}
                onClick={() => {
                  const v = { allocationId: confirm.alloc.id, reason: reason.trim() };
                  if (confirm.type === "swap") swap.mutate(v);
                  else release.mutate(v);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed transition ${
                  confirm.type === "swap"
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                }`}
              >
                {swap.isPending || release.isPending
                  ? "Aplicando…"
                  : confirm.type === "swap"
                  ? "Trocar agora"
                  : "Liberar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
