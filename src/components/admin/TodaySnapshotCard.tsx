import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Sparkles, ShoppingBag, Users } from "lucide-react";
import { getTodaySnapshot } from "@/lib/admin-kpis.functions";

const fmtBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Delta({ value, unit = "" }: { value: number; unit?: string }) {
  if (value === 0) {
    return <span className="text-xs text-muted-foreground">= ontem</span>;
  }
  const positive = value > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const color = positive ? "text-emerald-500" : "text-destructive";
  const prefix = positive ? "+" : "";
  const display = unit === "BRL" ? fmtBRL(Math.abs(value)) : `${Math.abs(value)}${unit}`;
  return (
    <span className={`text-xs font-semibold inline-flex items-center gap-1 ${color}`}>
      <Icon className="w-3 h-3" />
      {prefix}
      {value < 0 ? "-" : ""}
      {display} vs ontem
    </span>
  );
}

export function TodaySnapshotCard() {
  const fetchFn = useServerFn(getTodaySnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-today-snapshot"],
    queryFn: () => fetchFn(),
    refetchInterval: 60_000,
  });

  const today = data?.today;
  const salesText = isLoading
    ? "Carregando…"
    : today
      ? `${today.sales} venda${today.sales === 1 ? "" : "s"} hoje`
      : "Sem dados";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6">
      <div className="absolute -top-8 -right-8 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-xs uppercase tracking-wider font-bold text-primary">
            Hoje · {today?.label ?? "—"}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1 inline-flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Receita
            </p>
            <p className="text-3xl font-black">
              {today ? fmtBRL(today.revenue_cents) : "—"}
            </p>
            {data && <Delta value={data.diff.revenue_cents} unit="BRL" />}
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1 inline-flex items-center gap-1">
              <ShoppingBag className="w-3 h-3" /> Pedidos
            </p>
            <p className="text-3xl font-black">{today?.sales ?? "—"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{salesText}</p>
            {data && <Delta value={data.diff.sales} />}
          </div>

          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1 inline-flex items-center gap-1">
              <Users className="w-3 h-3" /> Novos clientes
            </p>
            <p className="text-3xl font-black">{today?.new_customers ?? "—"}</p>
            {data && <Delta value={data.diff.new_customers} />}
          </div>
        </div>

        {data && (
          <div className="mt-5 pt-4 border-t border-border/50 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">Ontem:</b> {data.yesterday.sales} pedidos ·{" "}
              {fmtBRL(data.yesterday.revenue_cents)}
            </span>
            <span>
              <b className="text-foreground">Últimos 30d:</b> {data.last30d.sales} pedidos ·{" "}
              {fmtBRL(data.last30d.revenue_cents)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
