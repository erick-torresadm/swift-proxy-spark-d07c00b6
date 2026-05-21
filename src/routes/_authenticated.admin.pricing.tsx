import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DollarSign, AlertTriangle, CheckCircle2, RefreshCw, Wand2, Save } from "lucide-react";
import { useState } from "react";
import { getPricingSnapshots, upsertPricingRule, setProductPrice } from "@/lib/inventory.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/pricing")({
  component: PricingPage,
});

const fmtUsd = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const fmtBrl = (cents: number | null) =>
  cents == null
    ? "—"
    : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PricingPage() {
  const fn = useServerFn(getPricingSnapshots);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-pricing"],
    queryFn: () => fn(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" /> Pricing dinâmico
          </h2>
          <p className="text-sm text-muted-foreground">
            Custo real ProxySeller × câmbio USD→BRL × markup. Detecta margem abaixo do mínimo.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border text-sm font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          Recalcular
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Produto</th>
                <th className="text-right p-3">Custo BRL</th>
                <th className="text-right p-3">Markup %</th>
                <th className="text-right p-3">Sugerido</th>
                <th className="text-right p-3">Preço atual (BRL)</th>
                <th className="text-right p-3">Margem</th>
                <th className="text-right p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Calculando custos…
                  </td>
                </tr>
              )}
              {(data ?? []).map((row) => (
                <PricingRow key={row.product_id} row={row} />
              ))}
              {!isLoading && (data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">
                    Nenhum produto cadastrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Câmbio é atualizado automaticamente (AwesomeAPI). Custo USD vem do endpoint{" "}
        <code className="px-1 bg-muted/30 rounded">/order/calc</code> da ProxySeller. Margem mínima padrão: 30%.
      </p>
    </div>
  );
}

type SnapshotRow = NonNullable<Awaited<ReturnType<typeof getPricingSnapshots>>>[number];

function PricingRow({ row }: { row: SnapshotRow }) {
  const qc = useQueryClient();
  const saveRule = useServerFn(upsertPricingRule);
  const savePrice = useServerFn(setProductPrice);
  const [markup, setMarkup] = useState<number>(row.markup_pct);
  const [priceBrl, setPriceBrl] = useState<string>(
    row.current_price_cents != null ? (row.current_price_cents / 100).toFixed(2) : "",
  );

  const ruleMut = useMutation({
    mutationFn: saveRule,
    onSuccess: () => {
      toast.success(`Markup atualizado: ${row.product_name}`);
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const priceMut = useMutation({
    mutationFn: savePrice,
    onSuccess: () => {
      toast.success(`Preço atualizado: ${row.product_name}`);
      qc.invalidateQueries({ queryKey: ["admin-pricing"] });
      qc.invalidateQueries({ queryKey: ["public-catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const marginColor =
    row.margin_pct == null
      ? "text-muted-foreground"
      : row.below_min_margin
        ? "text-red-500"
        : row.margin_pct >= 50
          ? "text-green-500"
          : "text-amber-500";

  const applySuggested = () => {
    if (row.suggested_price_cents == null) return;
    priceMut.mutate({
      data: {
        product_id: row.product_id,
        price_monthly_cents: row.suggested_price_cents,
        auto_yearly: true,
      },
    });
  };

  const applyManual = () => {
    const cents = Math.round(Number(priceBrl) * 100);
    if (!Number.isFinite(cents) || cents < 100) {
      toast.error("Preço inválido (mínimo R$ 1,00)");
      return;
    }
    priceMut.mutate({
      data: {
        product_id: row.product_id,
        price_monthly_cents: cents,
        auto_yearly: true,
      },
    });
  };

  return (
    <tr className="border-t border-border/50">
      <td className="p-3">
        <p className="font-semibold">{row.product_name}</p>
        <p className="text-xs text-muted-foreground">{row.product_slug}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Custo USD: <span className="font-mono">{fmtUsd(row.cost_usd)}</span>
        </p>
        {row.error && (
          <p className="text-xs text-red-500 flex items-center gap-1 mt-0.5">
            <AlertTriangle className="w-3 h-3" /> {row.error}
          </p>
        )}
      </td>
      <td className="p-3 text-right font-mono">{fmtBrl(row.cost_brl_cents)}</td>
      <td className="p-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            min={0}
            max={1000}
            step={1}
            value={markup}
            onChange={(e) => setMarkup(Number(e.target.value))}
            className="w-16 bg-muted/30 border border-border rounded px-2 py-1 text-right text-xs"
          />
          <button
            onClick={() =>
              ruleMut.mutate({
                data: { product_id: row.product_id, markup_pct: markup, min_margin_pct: 30 },
              })
            }
            disabled={ruleMut.isPending || markup === row.markup_pct}
            className="px-2 py-1 rounded bg-muted/40 hover:bg-muted text-[10px] font-bold disabled:opacity-30"
            title="Salvar markup"
          >
            <Save className="w-3 h-3" />
          </button>
        </div>
      </td>
      <td className="p-3 text-right font-mono font-bold">{fmtBrl(row.suggested_price_cents)}</td>
      <td className="p-3 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="text-xs text-muted-foreground">R$</span>
          <input
            type="number"
            min={1}
            step="0.01"
            value={priceBrl}
            onChange={(e) => setPriceBrl(e.target.value)}
            className="w-24 bg-muted/30 border border-border rounded px-2 py-1 text-right text-xs font-mono"
          />
          <button
            onClick={applyManual}
            disabled={priceMut.isPending}
            className="px-2 py-1 rounded bg-primary text-primary-foreground text-[10px] font-bold disabled:opacity-30"
            title="Salvar preço manual"
          >
            <Save className="w-3 h-3" />
          </button>
        </div>
      </td>
      <td className={`p-3 text-right font-bold ${marginColor}`}>
        {row.margin_pct == null ? "—" : `${row.margin_pct.toFixed(1)}%`}
        {row.below_min_margin && <AlertTriangle className="inline-block w-3 h-3 ml-1" />}
        {!row.below_min_margin && row.margin_pct != null && row.margin_pct >= 50 && (
          <CheckCircle2 className="inline-block w-3 h-3 ml-1" />
        )}
      </td>
      <td className="p-3 text-right">
        <button
          onClick={applySuggested}
          disabled={priceMut.isPending || row.suggested_price_cents == null}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green-500/15 text-green-500 text-[10px] font-bold disabled:opacity-30"
          title="Aplicar preço sugerido (anual = mensal × 12 × 0,825)"
        >
          <Wand2 className="w-3 h-3" /> Aplicar sugerido
        </button>
      </td>
    </tr>
  );
}

