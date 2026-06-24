import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, AlertTriangle, ChevronRight, RefreshCw, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  getInventoryByProduct,
  triggerProviderSync,
  previewRenewalSweep,
} from "@/lib/inventory.functions";

export const Route = createFileRoute("/_authenticated/admin/inventory/")({
  component: InventoryPage,
});

function InventoryPage() {
  const fn = useServerFn(getInventoryByProduct);
  const syncFn = useServerFn(triggerProviderSync);
  const previewFn = useServerFn(previewRenewalSweep);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => fn(),
    refetchInterval: 30000,
  });

  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewFn>> | null>(null);

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(
        `Sync: +${r.new_ips} IPs · ${r.expiry_updates} validades atualizadas em ${r.scanned_products} produtos.`,
      );
      qc.invalidateQueries({ queryKey: ["admin-inventory"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no sync"),
  });

  const prev = useMutation({
    mutationFn: () => previewFn({ data: { window_days: 3 } }),
    onSuccess: (r) => {
      setPreview(r);
      toast.success(
        `Próximos 3 dias: ${r.blocks_renewed} renovar (US$ ${r.cost_usd.toFixed(2)}) · ${r.blocks_abandoned} abandonar (~US$ ${r.cost_saved_usd_estimate.toFixed(2)} economia).`,
      );
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha no preview"),
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-xl font-bold mb-1">Estoque por produto</h2>
          <p className="text-sm text-muted-foreground">
            IPv6 (BR e EUA) trabalha com estoque em blocos de 10. IPv4 e ISP-BR são sob demanda.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => prev.mutate()}
            disabled={prev.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent text-sm font-medium disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
            {prev.isPending ? "Calculando…" : "Prever renovação (3d)"}
          </button>
          <button
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 text-sm font-bold disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Sincronizando…" : "Sincronizar com ProxySeller"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="bg-card border border-border rounded-2xl p-4 mb-6 text-sm">
          <p className="font-bold mb-2">Preview renovação — próximos {preview.window_days} dias</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Blocos vistos" value={preview.blocks_seen} />
            <Stat label="A renovar" value={preview.blocks_renewed} sub={`US$ ${preview.cost_usd.toFixed(2)}`} />
            <Stat label="A abandonar" value={preview.blocks_abandoned} sub={`~US$ ${preview.cost_saved_usd_estimate.toFixed(2)} economia`} accent="ok" />
            <Stat label="IPs a renovar" value={preview.ips_renewed} />
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="space-y-3">
        {(data ?? []).map((p) => {
          const min = p.rule?.min_stock ?? 0;
          const low = p.delivery_mode === "stock" && p.available < min;
          const wasteful = p.empty_blocks > 0;
          return (
            <Link
              key={p.id}
              to="/admin/inventory/$productId"
              params={{ productId: p.id }}
              className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap hover:border-primary/50 hover:bg-accent/30 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold">{p.name}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {p.category} · {p.country_code} · entrega: {p.delivery_mode}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Disponível</p>
                  <p className="text-xl font-black">{p.available}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Alocado</p>
                  <p className="text-xl font-black">{p.allocated}</p>
                </div>
                {p.total_blocks > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground">Blocos</p>
                    <p className="text-xl font-black">
                      {p.total_blocks - p.empty_blocks}
                      <span className="text-muted-foreground">/{p.total_blocks}</span>
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Mínimo</p>
                  <p className="text-xl font-black">{p.rule?.min_stock ?? "—"}</p>
                </div>
                {low && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-500 text-xs font-bold">
                    <AlertTriangle className="w-3 h-3" /> Repor
                  </span>
                )}
                {wasteful && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-500/15 text-rose-500 text-xs font-bold">
                    {p.empty_blocks} bloco(s) vazio(s)
                  </span>
                )}
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </div>

      {!isLoading && (data ?? []).length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: "ok" | "warn";
}) {
  const color = accent === "ok" ? "text-emerald-500" : accent === "warn" ? "text-amber-500" : "";
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
