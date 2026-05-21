import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Package, AlertTriangle, ChevronRight } from "lucide-react";
import { getInventoryByProduct } from "@/lib/inventory.functions";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
  component: InventoryPage,
});

function InventoryPage() {
  const fn = useServerFn(getInventoryByProduct);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-inventory"],
    queryFn: () => fn(),
    refetchInterval: 30000,
  });

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">Estoque por produto</h2>
      <p className="text-sm text-muted-foreground mb-6">
        IPv6 trabalha com estoque pré-comprado; IPv4/ISP são provisionados sob demanda.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      <div className="space-y-3">
        {(data ?? []).map((p) => {
          const min = p.rule?.min_stock ?? 0;
          const low = p.delivery_mode === "stock" && p.available < min;
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
                <div>
                  <p className="text-xs text-muted-foreground">Mínimo</p>
                  <p className="text-xl font-black">{p.rule?.min_stock ?? "—"}</p>
                </div>
                {low && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 text-amber-500 text-xs font-bold">
                    <AlertTriangle className="w-3 h-3" /> Repor
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
